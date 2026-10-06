import type { ReviewColumn } from "./types.js";

/** plan.md §6.1 — review column and stuck rules. */

/** Latest APPROVED / CHANGES_REQUESTED per reviewer; plain comments ignored. */
export function latestVerdicts(
  reviews: { reviewerLogin: string; state: string; submittedAt: Date }[],
): string[] {
  const byUser = new Map<string, string>();
  for (const r of [...reviews].sort(
    (a, b) => a.submittedAt.getTime() - b.submittedAt.getTime(),
  )) {
    if (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED") {
      byUser.set(r.reviewerLogin, r.state);
    } else if (r.state === "DISMISSED") {
      byUser.delete(r.reviewerLogin);
    }
  }
  return [...byUser.values()];
}

export function columnOf(
  requestedReviewers: number,
  verdicts: string[],
): ReviewColumn {
  if (verdicts.includes("CHANGES_REQUESTED")) return "changes_requested";
  if (verdicts.includes("APPROVED")) return "approved";
  return requestedReviewers === 0 ? "needs_reviewer" : "waiting";
}

export function isStuck(
  column: ReviewColumn,
  lastActivityAt: Date,
  stuckHours = 24,
  now = Date.now(),
): boolean {
  return (
    (column === "needs_reviewer" || column === "waiting") &&
    now - lastActivityAt.getTime() > stuckHours * 3_600_000
  );
}

/** A claimed PR has a reviewer in spirit even before GitHub does (plan M4). */
export function effectiveColumn(column: ReviewColumn, claimedBy: string | null): ReviewColumn {
  return column === "needs_reviewer" && claimedBy ? "waiting" : column;
}
