import { z } from "zod";
import { effectiveColumn, isStuck } from "./columns.js";
import type { ReviewColumn } from "./types.js";

/**
 * Board filtering and sorting (plan M5). Done in memory over the open PRs of
 * the repos a person can see. ponytail: fine to a few thousand open PRs; move
 * the filters into SQL if a workspace gets bigger than that.
 */

export const SIZES = { S: 100, M: 500 } as const; // lines changed: S < 100 ≤ M < 500 ≤ L

export const boardFilters = z.object({
  repoIds: z.array(z.number()).optional(), // empty or missing = all you can see
  author: z.string().optional(), // GitHub login
  reviewer: z.string().optional(), // GitHub login
  teamId: z.string().optional(),
  label: z.string().optional(),
  size: z.enum(["S", "M", "L"]).optional(),
  mine: z.boolean().optional(),
  waitingOnMe: z.boolean().optional(),
  priority: z.boolean().optional(),
  includeDrafts: z.boolean().optional(),
  sort: z.enum(["oldest", "biggest", "risk"]).default("oldest"),
});
export type BoardFilters = z.infer<typeof boardFilters>;

export interface BoardRow {
  repoId: number;
  number: number;
  authorLogin: string;
  requestedReviewers: string[];
  reviewColumn: ReviewColumn;
  claimedBy: string | null;
  lastActivityAt: Date;
  additions: number;
  deletions: number;
  labels: string[];
  priority: boolean;
  draft: boolean;
  ci: "pass" | "fail" | "pending" | "none";
}

export function sizeOf(row: { additions: number; deletions: number }): "S" | "M" | "L" {
  const lines = row.additions + row.deletions;
  return lines < SIZES.S ? "S" : lines < SIZES.M ? "M" : "L";
}

export function filterBoard<T extends BoardRow>(
  rows: T[],
  f: BoardFilters,
  ctx: { me: string | null; teamLogins: Set<string> | null; stuckHours: number; now?: number },
): (T & { column: ReviewColumn; stuck: boolean })[] {
  const lower = (s: string) => s.toLowerCase();
  const me = ctx.me ? lower(ctx.me) : null;
  const out = rows
    .filter((r) => f.includeDrafts || !r.draft)
    .filter((r) => !f.repoIds?.length || f.repoIds.includes(r.repoId))
    .filter((r) => !f.author || lower(r.authorLogin) === lower(f.author))
    .filter((r) => !f.reviewer || r.requestedReviewers.some((x) => lower(x) === lower(f.reviewer!)))
    .filter(
      (r) =>
        !ctx.teamLogins ||
        ctx.teamLogins.has(lower(r.authorLogin)) ||
        r.requestedReviewers.some((x) => ctx.teamLogins!.has(lower(x))),
    )
    .filter((r) => !f.label || r.labels.includes(f.label))
    .filter((r) => !f.size || sizeOf(r) === f.size)
    .filter((r) => !f.mine || (me !== null && lower(r.authorLogin) === me))
    .filter((r) => !f.waitingOnMe || (me !== null && r.requestedReviewers.some((x) => lower(x) === me)))
    .filter((r) => !f.priority || r.priority)
    .map((r) => {
      const column = effectiveColumn(r.reviewColumn, r.claimedBy);
      return { ...r, column, stuck: isStuck(column, r.lastActivityAt, ctx.stuckHours, ctx.now) };
    });

  const lines = (r: BoardRow) => r.additions + r.deletions;
  const risk = (r: (typeof out)[number]) => (r.stuck ? 4 : 0) + (r.ci === "fail" ? 2 : 0) + (r.priority ? 1 : 0);
  const byOldest = (a: BoardRow, b: BoardRow) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime();
  return out.sort((a, b) =>
    f.sort === "biggest"
      ? lines(b) - lines(a) || byOldest(a, b)
      : f.sort === "risk"
        ? risk(b) - risk(a) || lines(b) - lines(a) || byOldest(a, b)
        : Number(b.priority) - Number(a.priority) || byOldest(a, b),
  );
}
