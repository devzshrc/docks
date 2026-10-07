import { createSign } from "node:crypto";

/**
 * GitHub REST client using GitHub App installation tokens — plan.md §9.2.
 * Never expose tokens to the browser.
 *
 * Env (apps/server/.env): GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY (PEM; literal
 * "\n" sequences are accepted so it fits on one line).
 */
const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** Short-lived JWT that authenticates as the App itself (RS256). */
function appJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iat: now - 60, // allow for clock drift
    exp: now + 9 * 60,
    iss: env("GITHUB_APP_ID"),
  })}`;
  const key = env("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n");
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key, "base64url");
  return `${unsigned}.${signature}`;
}

async function request<T>(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new GitHubError(res.status, `GitHub ${res.status} ${path}: ${await res.text()}`);
  }
  const body = res.status === 204 ? undefined : await res.json();
  return { body: body as T, next: nextLink(res.headers.get("link")) };
}

function nextLink(link: string | null): string | null {
  const match = link?.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1]! : null;
}

const tokenCache = new Map<number, { token: string; expiresAt: number }>();

export async function getInstallationToken(installationId: number): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;
  const { body } = await request<{ token: string; expires_at: string }>(
    `/app/installations/${installationId}/access_tokens`,
    appJwt(),
    { method: "POST" },
  );
  tokenCache.set(installationId, {
    token: body.token,
    expiresAt: new Date(body.expires_at).getTime(),
  });
  return body.token;
}

export interface GhUser {
  login: string;
  id: number;
  avatar_url: string;
}

export interface GhInstallation {
  id: number;
  account: { login: string; type: "Organization" | "User" };
  suspended_at: string | null;
}

export interface GhRepo {
  id: number;
  full_name: string;
  default_branch: string;
}

export interface GhPull {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: "open" | "closed";
  merged_at: string | null;
  draft: boolean;
  user: GhUser;
  created_at: string;
  updated_at: string;
  head: { ref: string; sha: string };
  base: { ref: string };
  requested_reviewers: GhUser[];
  labels: { name: string }[];
  mergeable_state?: string;
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

export interface GhFile {
  sha: string;
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface GhReview {
  id: number;
  user: GhUser | null;
  state: string;
  submitted_at: string | null;
}

export interface GhCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  completed_at: string | null;
  started_at: string | null;
}

/** Calls bound to a token source; follows Link: rel="next" when paginating. */
function clientFor(getToken: () => Promise<string>) {
  const call = async <T>(path: string, init?: RequestInit) =>
    (await request<T>(path, await getToken(), init)).body;

  /** `pick` unwraps wrapped list responses. */
  async function paginate<T, R = T[]>(path: string, pick?: (r: R) => T[]) {
    const token = await getToken();
    const out: T[] = [];
    let url: string | null = path;
    while (url) {
      const page: { body: R; next: string | null } = await request<R>(url, token);
      out.push(...(pick ? pick(page.body) : (page.body as unknown as T[])));
      url = page.next;
    }
    return out;
  }

  /** GitHub GraphQL; throws on transport errors and on `errors` in the body. */
  async function graphql<T>(query: string, variables: Record<string, unknown>) {
    const res = await call<{ data?: T; errors?: { message: string }[] }>("/graphql", {
      method: "POST",
      body: JSON.stringify({ query, variables }),
    });
    if (res.errors?.length) throw new GitHubError(422, `GitHub GraphQL: ${res.errors.map((e) => e.message).join("; ")}`);
    return res.data as T;
  }

  return { call, paginate, graphql };
}

/** A line comment to post: right side = new code, left = removed lines. */
export interface NewLineComment {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  startLine?: number;
  body: string;
}

export interface ReviewThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  diffSide: "LEFT" | "RIGHT";
  comments: { id: number; author: string; body: string; createdAt: string }[];
}

const THREADS_QUERY = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
  repository(owner:$owner,name:$name){ pullRequest(number:$number){
    reviewThreads(first:100, after:$cursor){
      pageInfo{ hasNextPage endCursor }
      nodes{ id isResolved isOutdated path line diffSide
        comments(first:50){ nodes{ databaseId body createdAt author{ login } } } }
    } } } }`;

/** Reads as the App installation — used by sync jobs. */
export function installationClient(installationId: number) {
  const { call, paginate } = clientFor(() => getInstallationToken(installationId));
  return {
    listRepos: () =>
      paginate<GhRepo, { repositories: GhRepo[] }>(
        "/installation/repositories?per_page=100",
        (r) => r.repositories,
      ),
    listOpenPulls: (repo: string) =>
      paginate<GhPull>(`/repos/${repo}/pulls?state=open&per_page=100`),
    getPull: (repo: string, n: number) => call<GhPull>(`/repos/${repo}/pulls/${n}`),
    listFiles: (repo: string, n: number) =>
      paginate<GhFile>(`/repos/${repo}/pulls/${n}/files?per_page=100`),
    listReviews: (repo: string, n: number) =>
      paginate<GhReview>(`/repos/${repo}/pulls/${n}/reviews?per_page=100`),
    listChecks: (repo: string, sha: string) =>
      paginate<GhCheckRun, { check_runs: GhCheckRun[] }>(
        `/repos/${repo}/commits/${sha}/check-runs?per_page=100`,
        (r) => r.check_runs,
      ),
    /** File text at a ref (default branch when omitted). Throws GitHubError 404 if missing. */
    fileContent: async (repo: string, path: string, ref?: string) => {
      const res = await call<{ content: string; encoding: string }>(
        `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
      );
      return Buffer.from(res.content, res.encoding === "base64" ? "base64" : "utf8").toString("utf8");
    },
    /** Files changed between two commits (for "since my last review"). */
    compare: (repo: string, base: string, head: string) =>
      call<{ files?: { filename: string }[]; status: string }>(`/repos/${repo}/compare/${base}...${head}`),
    /** Auto-assign posts as the App. */
    requestReviewers: (repo: string, n: number, logins: string[]) =>
      call(`/repos/${repo}/pulls/${n}/requested_reviewers`, {
        method: "POST",
        body: JSON.stringify({ reviewers: logins }),
      }),
  };
}

/**
 * Writes as a person (user-to-server token), so GitHub attributes reviews and
 * merges to them and enforces their own permissions and branch protection.
 */
export function userClient(getToken: () => Promise<string>) {
  const { call, paginate, graphql } = clientFor(getToken);
  return {
    me: () => call<GhUser>("/user"),
    /** Installations of our App this person can access. */
    installations: () =>
      paginate<{ id: number }, { installations: { id: number }[] }>(
        "/user/installations?per_page=100",
        (r) => r.installations,
      ),
    /** Repos in that installation this person can see on GitHub. */
    installationRepos: (installationId: number) =>
      paginate<GhRepo, { repositories: GhRepo[] }>(
        `/user/installations/${installationId}/repositories?per_page=100`,
        (r) => r.repositories,
      ),
    /** A review, optionally with batched line comments (a "pending review" sent at once). */
    submitReview: (
      repo: string,
      n: number,
      event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
      body: string,
      comments: NewLineComment[] = [],
    ) =>
      call<GhReview>(`/repos/${repo}/pulls/${n}/reviews`, {
        method: "POST",
        body: JSON.stringify({
          event,
          body,
          comments: comments.map((c) => ({
            path: c.path,
            body: c.body,
            line: c.line,
            side: c.side,
            ...(c.startLine && c.startLine < c.line ? { start_line: c.startLine, start_side: c.side } : {}),
          })),
        }),
      }),
    /** Single line comment, posted right away. */
    comment: (repo: string, n: number, commitId: string, c: NewLineComment) =>
      call<{ id: number }>(`/repos/${repo}/pulls/${n}/comments`, {
        method: "POST",
        body: JSON.stringify({
          commit_id: commitId,
          path: c.path,
          body: c.body,
          line: c.line,
          side: c.side,
          ...(c.startLine && c.startLine < c.line ? { start_line: c.startLine, start_side: c.side } : {}),
        }),
      }),
    reply: (repo: string, n: number, commentId: number, body: string) =>
      call<{ id: number }>(`/repos/${repo}/pulls/${n}/comments/${commentId}/replies`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    threads: async (repo: string, n: number): Promise<ReviewThread[]> => {
      const [owner, name] = repo.split("/");
      const out: ReviewThread[] = [];
      let cursor: string | null = null;
      do {
        type Page = { repository: { pullRequest: { reviewThreads: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: (Omit<ReviewThread, "comments"> & { comments: { nodes: { databaseId: number; body: string; createdAt: string; author: { login: string } | null }[] } })[];
        } } } };
        const data: Page = await graphql<Page>(THREADS_QUERY, { owner, name, number: n, cursor });
        const page = data.repository.pullRequest.reviewThreads;
        for (const t of page.nodes) {
          out.push({
            ...t,
            comments: t.comments.nodes.map((c) => ({
              id: c.databaseId,
              author: c.author?.login ?? "ghost",
              body: c.body,
              createdAt: c.createdAt,
            })),
          });
        }
        cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
      } while (cursor);
      return out;
    },
    resolveThread: (threadId: string, resolve: boolean) =>
      graphql(
        resolve
          ? "mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread{ id } } }"
          : "mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ thread{ id } } }",
        { id: threadId },
      ),
    requestReviewers: (repo: string, n: number, logins: string[]) =>
      call(`/repos/${repo}/pulls/${n}/requested_reviewers`, {
        method: "POST",
        body: JSON.stringify({ reviewers: logins }),
      }),
    setLabels: (repo: string, n: number, labels: string[]) =>
      call(`/repos/${repo}/issues/${n}/labels`, { method: "PUT", body: JSON.stringify({ labels }) }),
    removeReviewers: (repo: string, n: number, logins: string[]) =>
      call(`/repos/${repo}/pulls/${n}/requested_reviewers`, {
        method: "DELETE",
        body: JSON.stringify({ reviewers: logins }),
      }),
    merge: (repo: string, n: number, method: "merge" | "squash" | "rebase") =>
      call<{ merged: boolean; message: string }>(`/repos/${repo}/pulls/${n}/merge`, {
        method: "PUT",
        body: JSON.stringify({ merge_method: method }),
      }),
  };
}

/** App-level call (JWT): look up an installation by id. */
export async function getInstallation(installationId: number) {
  return (await request<GhInstallation>(`/app/installations/${installationId}`, appJwt())).body;
}

/** URL a user visits to install the App; GitHub echoes `state` back to the setup URL. */
export function installUrl(state: string): string {
  return `https://github.com/apps/${env("GITHUB_APP_SLUG")}/installations/new?state=${encodeURIComponent(state)}`;
}
