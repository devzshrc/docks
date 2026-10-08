import { db, schema } from "@docks/db";
import { createHash } from "node:crypto";
import type { GhPull, GhReview, GhCheckRun } from "../review/github.js";

/** Snapshots are append-only at the application layer, not a tamper-proof audit system. */
export async function collectEvidence(
  repoId: number,
  pr: GhPull,
  reviews: GhReview[],
  checks: GhCheckRun[],
) {
  const entries: (typeof schema.reviewEvidence.$inferInsert)[] = reviews
    .filter((r) => r.user && r.submitted_at)
    .map((r) => ({
      repoId,
      prNumber: pr.number,
      kind: "review",
      sourceKey: `${repoId}:review:${r.id}:${r.state}`,
      occurredAt: new Date(r.submitted_at!),
      data: {
        source: "GitHub API",
        actor: r.user!.login,
        headSha: r.commit_id ?? null,
        reviews: [
          {
            login: r.user!.login,
            state: r.state,
            sha: r.commit_id ?? null,
            at: r.submitted_at!,
          },
        ],
        checks: [],
        mergeSha: null,
        gaps: [
          "Historical check results and branch rules at review time were not captured.",
          "Reviews predating collection can have incomplete decision history.",
        ],
      },
    }));
  if (pr.merged_at)
    entries.push({
      repoId,
      prNumber: pr.number,
      kind: "merge",
      sourceKey: `${repoId}:merge:${pr.number}:${pr.merged_at}`,
      occurredAt: new Date(pr.merged_at),
      data: {
        source: "GitHub API",
        actor: pr.merged_by?.login ?? null,
        headSha: pr.head.sha,
        mergeSha: pr.merge_commit_sha ?? null,
        reviews: reviews
          .filter((r) => r.user && r.submitted_at)
          .map((r) => ({
            login: r.user!.login,
            state: r.state,
            sha: r.commit_id ?? null,
            at: r.submitted_at!,
          })),
        checks: checks.map((c) => ({
          name: c.name,
          status: c.status,
          conclusion: c.conclusion,
        })),
        gaps: [
          "Checks reflect collection time, not necessarily merge time.",
          "Commit statuses and historical branch rules are not included.",
        ],
      },
    });
  if (entries.length)
    await db
      .insert(schema.reviewEvidence)
      .values(entries)
      .onConflictDoNothing();
}
export async function collectWebhookEvidence(
  repoId: number,
  event: string,
  payload: unknown,
) {
  const p = payload as {
    action?: string;
    pull_request?: { number: number; head: { sha: string } };
    review?: GhReview;
  };
  if (
    event !== "pull_request_review" ||
    !["submitted", "dismissed"].includes(p.action ?? "") ||
    !p.pull_request ||
    !p.review?.user
  )
    return;
  const r = p.review;
  const data = {
    source: "GitHub webhook",
    actor: r.user!.login,
    headSha: r.commit_id ?? null,
    reviews: [
      {
        login: r.user!.login,
        state: p.action === "dismissed" ? "DISMISSED" : r.state,
        sha: r.commit_id ?? null,
        at: r.submitted_at,
      },
    ],
    checks: [],
    mergeSha: null,
    gaps: ["Checks and branch rules were not captured in this review event."],
  };
  await db
    .insert(schema.reviewEvidence)
    .values({
      repoId,
      prNumber: p.pull_request.number,
      kind: "review",
      sourceKey: `${repoId}:webhook:${r.id}:${createHash("sha256").update(JSON.stringify(data)).digest("hex")}`,
      occurredAt: r.submitted_at ? new Date(r.submitted_at) : new Date(),
      data,
    })
    .onConflictDoNothing();
}
export function csvCell(value: unknown) {
  let text =
    value == null
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
