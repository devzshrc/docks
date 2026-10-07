import { db, schema } from "@docks/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { reviewLoad } from "../routers/people.js";
import { installationClient } from "./github.js";

/**
 * Reviewer suggestions (plan M4). Signals, strongest first: CODEOWNERS,
 * expertise tags matching changed paths, past reviews in the same folders,
 * then lightest current load. Away, over-limit and the author are skipped.
 * ponytail: heuristic ranking; replace with history-weighted scoring if teams ask.
 */

// ---- CODEOWNERS ------------------------------------------------------------------

export interface OwnerRule {
  pattern: RegExp;
  owners: string[]; // GitHub logins, lowercased, without "@"; team owners are skipped
}

/** gitignore-style CODEOWNERS pattern → regex over repo-relative paths. */
export function globToRegex(glob: string): RegExp {
  let g = glob.trim();
  const anchored = g.startsWith("/");
  if (anchored) g = g.slice(1);
  const dir = g.endsWith("/");
  if (dir) g = g.slice(0, -1);
  const body = g
    .split("**")
    .map((part) =>
      part
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]"),
    )
    .join(".*");
  // A bare name (no slash) matches at any depth; a trailing slash or a
  // directory match also covers everything underneath.
  const prefix = anchored || g.includes("/") ? "^" : "(^|.*/)";
  return new RegExp(`${prefix}${body}(/.*)?$`);
}

export function parseCodeowners(text: string): OwnerRule[] {
  const rules: OwnerRule[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    rules.push({
      pattern: globToRegex(pattern!),
      owners: owners
        .filter((o) => o.startsWith("@") && !o.includes("/")) // skip @org/team and emails
        .map((o) => o.slice(1).toLowerCase()),
    });
  }
  return rules;
}

/** Last matching rule wins, as on GitHub. */
export function ownersFor(rules: OwnerRule[], path: string): string[] {
  let owners: string[] = [];
  for (const r of rules) if (r.pattern.test(path)) owners = r.owners;
  return owners;
}

// ponytail: in-memory, per process, per day; move to a table if instances multiply.
const codeownersCache = new Map<number, { day: string; rules: OwnerRule[] }>();

async function codeownersFor(repo: { id: number; fullName: string; installationId: number }) {
  const day = new Date().toISOString().slice(0, 10);
  const hit = codeownersCache.get(repo.id);
  if (hit?.day === day) return hit.rules;
  const gh = installationClient(repo.installationId);
  let rules: OwnerRule[] = [];
  for (const path of [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"]) {
    const text = await gh.fileContent(repo.fullName, path).catch(() => null);
    if (text !== null) {
      rules = parseCodeowners(text);
      break;
    }
  }
  codeownersCache.set(repo.id, { day, rules });
  return rules;
}

// ---- Ranking (pure) --------------------------------------------------------------

export interface Candidate {
  userId: string;
  login: string;
  name: string;
  away: boolean;
  openReviews: number;
  maxOpenReviews: number | null;
  expertise: string[];
}

export interface Suggestion extends Candidate {
  score: number;
  reasons: string[];
  atLimit: boolean;
}

const segments = (path: string) => path.toLowerCase().split(/[/._-]+/).filter(Boolean);

export function rankReviewers(
  candidates: Candidate[],
  input: {
    author: string;
    paths: string[];
    codeowners: Set<string>;
    folderReviews: Map<string, number>; // login → past reviews touching these folders
    exclude?: Set<string>; // already requested
  },
): Suggestion[] {
  const pathSegments = new Set(input.paths.flatMap(segments));
  return candidates
    .filter((c) => c.login.toLowerCase() !== input.author.toLowerCase())
    .filter((c) => !input.exclude?.has(c.login.toLowerCase()))
    .filter((c) => !c.away)
    .map((c) => {
      const reasons: string[] = [];
      let score = 0;
      if (input.codeowners.has(c.login.toLowerCase())) {
        score += 10;
        reasons.push("code owner");
      }
      const matched = c.expertise.filter((e) => pathSegments.has(e.toLowerCase()));
      if (matched.length) {
        score += 3 * matched.length;
        reasons.push(`knows ${matched.join(", ")}`);
      }
      const history = input.folderReviews.get(c.login.toLowerCase()) ?? 0;
      if (history) {
        score += Math.min(history, 5);
        reasons.push(`reviewed ${history} PR${history === 1 ? "" : "s"} here`);
      }
      score -= c.openReviews * 0.5;
      const atLimit = c.maxOpenReviews !== null && c.openReviews >= c.maxOpenReviews;
      if (atLimit) score -= 100; // still listed, last, with a warning
      return { ...c, score, reasons, atLimit };
    })
    .sort((a, b) => b.score - a.score || a.openReviews - b.openReviews || a.name.localeCompare(b.name));
}

// ---- Data gathering -----------------------------------------------------------------

/** Members who could actually take this repo's work: linked GitHub, access to the repo, allowed to act. */
export async function reviewCandidates(repoId: number, workspaceId: string): Promise<Candidate[]> {
  const today = new Date().toISOString().slice(0, 10);
  const members = await db
    .select({
      userId: schema.user.id,
      name: schema.user.name,
      login: schema.githubIdentity.githubLogin,
      role: schema.workspaceMember.role,
      repoIds: schema.workspaceMember.repoIds,
      awayUntil: schema.workspaceMember.awayUntil,
      expertise: schema.workspaceMember.expertise,
      maxOpenReviews: schema.workspaceMember.maxOpenReviews,
    })
    .from(schema.workspaceMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
    .innerJoin(schema.githubIdentity, eq(schema.githubIdentity.userId, schema.user.id))
    .innerJoin(
      schema.githubRepoAccess,
      and(eq(schema.githubRepoAccess.userId, schema.user.id), eq(schema.githubRepoAccess.repoId, repoId)),
    )
    .where(eq(schema.workspaceMember.workspaceId, workspaceId));
  const load = await reviewLoad(workspaceId);
  return members
    .filter((m) => m.role !== "viewer" && (!m.repoIds || m.repoIds.includes(repoId)))
    .map((m) => ({
      userId: m.userId,
      login: m.login,
      name: m.name,
      away: Boolean(m.awayUntil && m.awayUntil >= today),
      openReviews: load.get(m.login)?.open ?? 0,
      maxOpenReviews: m.maxOpenReviews,
      expertise: m.expertise,
    }));
}


/** Logins that CODEOWNERS names for any of these paths (empty when there is no CODEOWNERS or no access). */
export async function codeownerLogins(repo: { id: number; fullName: string; installationId: number }, paths: string[]) {
  try {
    const rules = await codeownersFor(repo);
    return new Set(paths.flatMap((p) => ownersFor(rules, p)));
  } catch {
    return new Set<string>();
  }
}

/** Ranked suggestions for one PR. `withCodeowners: false` skips the GitHub call (tests, demo). */
export async function suggestReviewers(repoId: number, number: number, opts: { withCodeowners?: boolean } = {}) {
  const [row] = await db
    .select({
      fullName: schema.repository.fullName,
      installationId: schema.repository.installationId,
      workspaceId: schema.githubInstallation.workspaceId,
      author: schema.pullRequest.authorLogin,
      headSha: schema.pullRequest.headSha,
      requested: schema.pullRequest.requestedReviewers,
    })
    .from(schema.pullRequest)
    .innerJoin(schema.repository, eq(schema.repository.id, schema.pullRequest.repoId))
    .innerJoin(schema.githubInstallation, eq(schema.githubInstallation.id, schema.repository.installationId))
    .where(and(eq(schema.pullRequest.repoId, repoId), eq(schema.pullRequest.number, number)));
  if (!row) return [];

  const paths = (
    await db
      .select({ path: schema.prFile.path })
      .from(schema.prFile)
      .where(and(eq(schema.prFile.repoId, repoId), eq(schema.prFile.prNumber, number), eq(schema.prFile.headSha, row.headSha)))
  ).map((r) => r.path);

  const candidates = await reviewCandidates(repoId, row.workspaceId);

  // Past reviews on PRs touching the same top-level folders.
  const folders = [...new Set(paths.map((p) => p.split("/").slice(0, 2).join("/")))];
  const folderReviews = new Map<string, number>();
  if (folders.length && candidates.length) {
    const rows = await db.execute<{ login: string; n: number }>(sql`
      SELECT lower(r.reviewer_login) AS login, count(DISTINCT r.pr_number)::int AS n
      FROM ${schema.prReview} r
      WHERE r.repo_id = ${repoId} AND r.pr_number <> ${number}
        AND EXISTS (
          SELECT 1 FROM ${schema.prFile} f
          WHERE f.repo_id = r.repo_id AND f.pr_number = r.pr_number
            AND substring(f.path from '^[^/]+(?:/[^/]+)?') IN (${sql.join(
              folders.map((f) => sql`${f}`),
              sql`, `,
            )})
        )
      GROUP BY 1`);
    for (const r of rows.rows) folderReviews.set(r.login, r.n);
  }

  let codeowners = new Set<string>();
  if (opts.withCodeowners !== false) {
    try {
      const rules = await codeownersFor({ id: repoId, fullName: row.fullName, installationId: row.installationId });
      codeowners = new Set(paths.flatMap((p) => ownersFor(rules, p)));
    } catch {
      // No CODEOWNERS access (demo repo, App not installed): rank without it.
    }
  }

  return rankReviewers(candidates, {
    author: row.author,
    paths,
    codeowners,
    folderReviews,
    exclude: new Set(row.requested.map((r) => r.toLowerCase())),
  });
}

/** Members' ids by login, to show who's who in the picker. */
export async function loginsToUsers(workspaceId: string, logins: string[]) {
  if (!logins.length) return new Map<string, string>();
  const rows = await db
    .select({ login: schema.githubIdentity.githubLogin, name: schema.user.name })
    .from(schema.githubIdentity)
    .innerJoin(schema.user, eq(schema.user.id, schema.githubIdentity.userId))
    .innerJoin(schema.workspaceMember, eq(schema.workspaceMember.userId, schema.user.id))
    .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), inArray(schema.githubIdentity.githubLogin, logins)));
  return new Map(rows.map((r) => [r.login, r.name]));
}
