import { db, schema } from "@docks/db";
import { and, eq, notInArray } from "drizzle-orm";
import { enqueue } from "../jobs.js";
import { GitHubError, installationClient, type GhIssueRest } from "./github.js";

/** Keeps the `issue` mirror in step with GitHub; pull requests are never stored here. */

/** The columns we keep from a REST issue. */
export function issueRow(repoId: number, i: GhIssueRest) {
  return {
    repoId,
    number: i.number,
    title: i.title,
    body: i.body,
    state: (i.state === "open" ? "open" : "closed") as "open" | "closed",
    stateReason: i.state_reason ?? null,
    authorLogin: i.user?.login ?? "ghost",
    assignees: (i.assignees ?? []).map((a) => a.login),
    labels: i.labels.flatMap((l) => (typeof l === "string" ? [{ name: l, color: "888888" }] : [{ name: l.name, color: l.color }])),
    milestone: i.milestone?.title ?? null,
    commentsCount: i.comments,
    ghCreatedAt: new Date(i.created_at),
    ghUpdatedAt: new Date(i.updated_at),
    closedAt: i.closed_at ? new Date(i.closed_at) : null,
  };
}

export async function upsertIssue(repoId: number, i: GhIssueRest) {
  if (i.pull_request) return;
  const row = issueRow(repoId, i);
  await db
    .insert(schema.issue)
    .values(row)
    .onConflictDoUpdate({ target: [schema.issue.repoId, schema.issue.number], set: { ...row, repoId: undefined, number: undefined } });
}

async function loadRepo(repoId: number) {
  const [repo] = await db
    .select({ id: schema.repository.id, fullName: schema.repository.fullName, installationId: schema.repository.installationId, enabled: schema.repository.enabled })
    .from(schema.repository)
    .where(eq(schema.repository.id, repoId))
    .limit(1);
  return repo;
}

/** Refetch one issue (e.g. after someone edits it on GitHub). */
export async function syncIssue(repoId: number, number: number) {
  const repo = await loadRepo(repoId);
  if (!repo?.enabled) return;
  try {
    const issue = await installationClient(repo.installationId).getIssueRest(repo.fullName, number);
    await upsertIssue(repoId, issue);
  } catch (err) {
    // Deleted or transferred away: drop our copy.
    if (err instanceof GitHubError && (err.status === 404 || err.status === 410)) {
      await db.delete(schema.issue).where(and(eq(schema.issue.repoId, repoId), eq(schema.issue.number, number)));
      return;
    }
    throw err;
  }
}

/** Backfill: every open issue, plus anything closed in the last 90 days. */
export async function syncRepoIssues(repoId: number) {
  const repo = await loadRepo(repoId);
  if (!repo?.enabled) return;
  const gh = installationClient(repo.installationId);
  const since = new Date(Date.now() - 90 * 24 * 3_600_000).toISOString();
  const [open, closed] = await Promise.all([gh.listIssues(repo.fullName, { state: "open" }), gh.listIssues(repo.fullName, { state: "closed", since })]);
  for (const i of [...open, ...closed]) await upsertIssue(repoId, i);

  // Issues we still think are open but GitHub no longer lists as open: refetch them.
  const openNumbers = open.map((i) => i.number);
  const stale = await db
    .select({ number: schema.issue.number })
    .from(schema.issue)
    .where(and(eq(schema.issue.repoId, repoId), eq(schema.issue.state, "open"), ...(openNumbers.length ? [notInArray(schema.issue.number, openNumbers)] : [])));
  for (const s of stale) await enqueue("sync_issue", { repoId, number: s.number });

  await db.update(schema.repository).set({ issuesSyncedAt: new Date() }).where(eq(schema.repository.id, repoId));
}
