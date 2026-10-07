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
      // GitHub rejects requests without one (Workers' fetch doesn't add a default).
      "User-Agent": "docks",
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
  /** What the installation has granted the App, e.g. { issues: "write" }. */
  permissions?: Record<string, string>;
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

export interface BlameRange {
  start: number;
  end: number;
  oid: string;
  headline: string;
  date: string;
  author: string;
  pr: { number: number; title: string; url: string } | null;
}

export interface GhIssue {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  labels: { name: string; color: string }[];
  assignees: { login: string; avatar: string }[];
}

const BLAME_QUERY = `query($owner:String!,$name:String!,$oid:GitObjectID!,$path:String!){
  repository(owner:$owner,name:$name){ object(oid:$oid){ ... on Commit { blame(path:$path){ ranges{
    startingLine endingLine
    commit{ oid abbreviatedOid messageHeadline committedDate author{ name user{ login } }
      associatedPullRequests(first:1){ nodes{ number title url } } } } } } } } }`;

const CLOSING_QUERY = `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){ pullRequest(number:$number){ closingIssuesReferences(first:10){ nodes{
    number title url state repository{ nameWithOwner }
    labels(first:5){ nodes{ name color } } assignees(first:3){ nodes{ login avatarUrl } } } } } } }`;

/** An issue as GitHub's REST API returns it. */
export interface GhIssueRest {
  number: number;
  title: string;
  body: string | null;
  state: string;
  state_reason?: string | null;
  html_url: string;
  user: { login: string } | null;
  assignees: { login: string }[] | null;
  labels: ({ name: string; color: string } | string)[];
  milestone: { title: string } | null;
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  pull_request?: unknown;
}

export interface GhIssueComment {
  id: number;
  body: string;
  user: { login: string } | null;
  created_at: string;
  updated_at: string;
  author_association?: string;
}

export interface IssuePatch {
  title?: string;
  body?: string;
  state?: "open" | "closed";
  state_reason?: "completed" | "not_planned" | "duplicate" | "reopened";
  labels?: string[];
  assignees?: string[];
  milestone?: number | null;
}

/** Issue calls shared by the App client (sync) and the person's client (edits). */
function issueApi(call: ReturnType<typeof clientFor>["call"], paginate: ReturnType<typeof clientFor>["paginate"]) {
  return {
    getIssueRest: (repo: string, n: number) => call<GhIssueRest>(`/repos/${repo}/issues/${n}`),
    /** Open issues plus anything touched since `since` (ISO), pull requests filtered out. */
    listIssues: async (repo: string, opts: { state: "open" | "closed" | "all"; since?: string }) => {
      const q = new URLSearchParams({ state: opts.state, per_page: "100", sort: "updated", direction: "desc" });
      if (opts.since) q.set("since", opts.since);
      return (await paginate<GhIssueRest>(`/repos/${repo}/issues?${q}`)).filter((i) => !i.pull_request);
    },
    issueComments: (repo: string, n: number) =>
      paginate<GhIssueComment>(`/repos/${repo}/issues/${n}/comments?per_page=100`),
    patchIssue: (repo: string, n: number, patch: IssuePatch) =>
      call<GhIssueRest>(`/repos/${repo}/issues/${n}`, { method: "PATCH", body: JSON.stringify(patch) }),
    addIssueComment: (repo: string, n: number, body: string) =>
      call<GhIssueComment>(`/repos/${repo}/issues/${n}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
    listMilestones: async (repo: string) =>
      (await paginate<{ number: number; title: string; state: string }>(`/repos/${repo}/milestones?state=open&per_page=100`)).map((m) => ({
        number: m.number,
        title: m.title,
      })),
  };
}

/** Reads as the App installation — used by sync jobs. */
export function installationClient(installationId: number) {
  const { call, paginate, graphql } = clientFor(() => getInstallationToken(installationId));
  return {
    ...issueApi(call, paginate),
    listRepos: () =>
      paginate<GhRepo, { repositories: GhRepo[] }>(
        "/installation/repositories?per_page=100",
        (r) => r.repositories,
      ),
    listOpenPulls: (repo: string) =>
      paginate<GhPull>(`/repos/${repo}/pulls?state=open&per_page=100`),
    getPull: (repo: string, n: number) => call<GhPull>(`/repos/${repo}/pulls/${n}`),
    listRecentlyClosed: (repo: string) =>
      call<GhPull[]>(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`),
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
      call<{ files?: { filename: string }[]; status: string; merge_base_commit?: { sha: string } }>(
        `/repos/${repo}/compare/${base}...${head}`,
      ),
    /** Per-line history of a file at a commit: who last changed each range, and in which PR. */
    blame: async (repo: string, oid: string, path: string): Promise<BlameRange[]> => {
      const [owner, name] = repo.split("/");
      type R = { repository: { object: { blame?: { ranges: {
        startingLine: number; endingLine: number;
        commit: { oid: string; abbreviatedOid: string; messageHeadline: string; committedDate: string;
          author: { name: string | null; user: { login: string } | null } | null;
          associatedPullRequests: { nodes: { number: number; title: string; url: string }[] } };
      }[] } } | null } };
      const data = await graphql<R>(BLAME_QUERY, { owner, name, oid, path });
      return (data.repository.object?.blame?.ranges ?? []).map((r) => ({
        start: r.startingLine,
        end: r.endingLine,
        oid: r.commit.abbreviatedOid,
        headline: r.commit.messageHeadline,
        date: r.commit.committedDate,
        author: r.commit.author?.user?.login ?? r.commit.author?.name ?? "unknown",
        pr: r.commit.associatedPullRequests.nodes[0] ?? null,
      }));
    },
    /** Issues GitHub itself links to this PR (closing keywords or the Development sidebar). */
    closingIssues: async (repo: string, n: number): Promise<GhIssue[]> => {
      const [owner, name] = repo.split("/");
      type R = { repository: { pullRequest: { closingIssuesReferences: { nodes: {
        number: number; title: string; url: string; state: string;
        labels: { nodes: { name: string; color: string }[] };
        assignees: { nodes: { login: string; avatarUrl: string }[] };
        repository: { nameWithOwner: string };
      }[] } } } };
      const data = await graphql<R>(CLOSING_QUERY, { owner, name, number: n });
      return data.repository.pullRequest.closingIssuesReferences.nodes
        .filter((i) => i.repository.nameWithOwner.toLowerCase() === repo.toLowerCase())
        .map((i) => ({
          number: i.number,
          title: i.title,
          url: i.url,
          state: i.state.toLowerCase() === "open" ? "open" : "closed",
          labels: i.labels.nodes,
          assignees: i.assignees.nodes.map((a) => ({ login: a.login, avatar: a.avatarUrl })),
        }));
    },
    /** One issue (null if it's a PR or doesn't exist). */
    issue: async (repo: string, n: number): Promise<GhIssue | null> => {
      try {
        const i = await call<{
          number: number; title: string; html_url: string; state: string; pull_request?: unknown;
          labels: ({ name: string; color: string } | string)[]; assignees: { login: string; avatar_url: string }[];
        }>(`/repos/${repo}/issues/${n}`);
        if (i.pull_request) return null;
        return {
          number: i.number,
          title: i.title,
          url: i.html_url,
          state: i.state === "open" ? "open" : "closed",
          labels: i.labels.flatMap((l) => (typeof l === "string" ? [] : [{ name: l.name, color: l.color }])),
          assignees: i.assignees.map((a) => ({ login: a.login, avatar: a.avatar_url })),
        };
      } catch (err) {
        if (err instanceof GitHubError && (err.status === 404 || err.status === 410)) return null;
        throw err;
      }
    },
    /** Repo flags the "New issue" panel needs. */
    repoMeta: async (repo: string) => {
      const r = await call<{ has_issues: boolean; archived: boolean; disabled: boolean; default_branch: string }>(`/repos/${repo}`);
      const ref = await call<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${r.default_branch.split("/").map(encodeURIComponent).join("/")}`);
      return { hasIssues: r.has_issues, archived: r.archived || r.disabled, defaultBranch: r.default_branch, headSha: ref.object.sha };
    },
    /** Every file path at a commit. `truncated` when GitHub cut the listing (huge repos). */
    tree: async (repo: string, sha: string) => {
      const t = await call<{ tree: { path: string; type: string }[]; truncated: boolean }>(`/repos/${repo}/git/trees/${sha}?recursive=1`);
      return { paths: t.tree.filter((e) => e.type === "blob").map((e) => e.path), truncated: t.truncated };
    },
    listLabels: async (repo: string) =>
      (await paginate<{ name: string; color: string }>(`/repos/${repo}/labels?per_page=100`)).map((l) => ({ name: l.name, color: l.color })),
    /** Logins GitHub allows as assignees on this repo. */
    listAssignees: async (repo: string) =>
      (await paginate<{ login: string }>(`/repos/${repo}/assignees?per_page=100`)).map((a) => a.login),
    /** Files in .github/ISSUE_TEMPLATE (empty when the folder doesn't exist). */
    issueTemplateFiles: async (repo: string) => {
      try {
        const list = await call<{ name: string; type: string }[]>(`/repos/${repo}/contents/.github/ISSUE_TEMPLATE`);
        return Array.isArray(list) ? list.filter((f) => f.type === "file").map((f) => f.name) : [];
      } catch (err) {
        if (err instanceof GitHubError && err.status === 404) return [];
        throw err;
      }
    },
    searchIssues: async (repo: string, terms: string[]) => {
      const q = encodeURIComponent(`repo:${repo} is:issue is:open in:title ${terms.join(" ")}`);
      const res = await call<{ items: { number: number; title: string; html_url: string; labels: { name: string }[]; comments: number; updated_at: string }[] }>(
        `/search/issues?q=${q}&per_page=5&sort=updated`,
      );
      return res.items.map((i) => ({ number: i.number, title: i.title, url: i.html_url, labels: i.labels.map((l) => l.name), comments: i.comments, updatedAt: i.updated_at }));
    },
    /** Open issues across several repos by title text, for ⌘K. */
    searchIssuesIn: async (repos: string[], text: string) => {
      const q = encodeURIComponent(`is:issue is:open in:title ${text} ${repos.map((r) => `repo:${r}`).join(" ")}`);
      const res = await call<{ items: { number: number; title: string; html_url: string; repository_url: string }[] }>(`/search/issues?q=${q}&per_page=6&sort=updated`);
      return res.items.map((i) => ({ number: i.number, title: i.title, url: i.html_url, repo: i.repository_url.replace(/^.*\/repos\//, "") }));
    },
    /** Fallback when the person hasn't linked GitHub: created by the App, attributed in the body. */
    createIssue: (repo: string, input: { title: string; body: string; labels: string[]; assignees: string[] }) =>
      call<{ number: number; html_url: string; labels: ({ name: string } | string)[]; assignees: { login: string }[] | null }>(
        `/repos/${repo}/issues`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    /** Routing rules post as the App. */
    addLabels: (repo: string, n: number, labels: string[]) =>
      call(`/repos/${repo}/issues/${n}/labels`, { method: "POST", body: JSON.stringify({ labels }) }),
    commentOnPr: (repo: string, n: number, body: string) =>
      call(`/repos/${repo}/issues/${n}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
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
    ...issueApi(call, paginate),
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
    /** Created as the person, so GitHub attributes it to them and applies their own permissions. */
    createIssue: (repo: string, input: { title: string; body: string; labels: string[]; assignees: string[] }) =>
      call<{ number: number; html_url: string; labels: ({ name: string } | string)[]; assignees: { login: string }[] | null }>(
        `/repos/${repo}/issues`,
        { method: "POST", body: JSON.stringify(input) },
      ),
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
