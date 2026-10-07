import { sizeOf } from "./review/board.js";

/**
 * Review insights (plan M7), computed in memory from mirrored PRs and reviews.
 * ponytail: fine for tens of thousands of PRs per range; move to SQL
 * aggregates if a workspace outgrows that.
 */

export interface InsightPr {
  repo: string;
  number: number;
  authorLogin: string;
  ghCreatedAt: Date | null;
  mergedAt: Date | null;
  firstReviewAt: Date | null;
  additions: number;
  deletions: number;
}

export interface InsightReview {
  repo: string;
  prNumber: number;
  reviewerLogin: string;
  submittedAt: Date;
}

const HOUR = 3_600_000;

export function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

const median = (v: number[]) => quantile(v, 0.5);
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
const hoursBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / HOUR;

/** Monday 00:00 UTC of the week containing `d`, as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

export function computeInsights(
  prs: InsightPr[],
  reviews: InsightReview[],
  opts: { from: Date; to: Date; weeks?: number; perPerson?: boolean },
) {
  const inRange = (d: Date | null): d is Date => d !== null && d >= opts.from && d <= opts.to;
  const opened = prs.filter((p) => inRange(p.ghCreatedAt));
  const merged = prs.filter((p) => inRange(p.mergedAt));

  const ttfr = opened.flatMap((p) => (p.firstReviewAt && p.ghCreatedAt ? [hoursBetween(p.ghCreatedAt, p.firstReviewAt)] : []));
  const cycle = merged.flatMap((p) => (p.ghCreatedAt && p.mergedAt ? [hoursBetween(p.ghCreatedAt, p.mergedAt)] : []));

  const sizes = { S: 0, M: 0, L: 0 };
  for (const p of opened) sizes[sizeOf(p)]++;

  // Weekly trend over the last N weeks ending at `to`.
  const weeks = opts.weeks ?? 12;
  const trendStart = new Date(opts.to.getTime() - weeks * 7 * 24 * HOUR);
  const byWeek = new Map<string, { merged: number; ttfr: number[] }>();
  for (let i = weeks - 1; i >= 0; i--) {
    byWeek.set(weekStart(new Date(opts.to.getTime() - i * 7 * 24 * HOUR)), { merged: 0, ttfr: [] });
  }
  for (const p of prs) {
    if (p.mergedAt && p.mergedAt >= trendStart && p.mergedAt <= opts.to) {
      const w = byWeek.get(weekStart(p.mergedAt));
      if (w) w.merged++;
    }
    if (p.ghCreatedAt && p.firstReviewAt && p.ghCreatedAt >= trendStart && p.ghCreatedAt <= opts.to) {
      byWeek.get(weekStart(p.ghCreatedAt))?.ttfr.push(hoursBetween(p.ghCreatedAt, p.firstReviewAt));
    }
  }

  // Slowest repos by median time to first review.
  const repoWaits = new Map<string, number[]>();
  for (const p of opened) {
    if (!p.firstReviewAt || !p.ghCreatedAt) continue;
    repoWaits.set(p.repo, [...(repoWaits.get(p.repo) ?? []), hoursBetween(p.ghCreatedAt, p.firstReviewAt)]);
  }

  // Per reviewer: how long after a PR opened they first reviewed it. Admin-only.
  let reviewers: { login: string; reviews: number; medianHoursToReview: number | null }[] | null = null;
  if (opts.perPerson) {
    const byKey = new Map(prs.map((p) => [`${p.repo}#${p.number}`, p]));
    const first = new Map<string, Map<string, number>>(); // login -> PR -> hours
    for (const r of reviews) {
      if (!inRange(r.submittedAt)) continue;
      const key = `${r.repo}#${r.prNumber}`;
      const pr = byKey.get(key);
      if (!pr?.ghCreatedAt || pr.authorLogin.toLowerCase() === r.reviewerLogin.toLowerCase()) continue;
      const mine = first.get(r.reviewerLogin) ?? new Map<string, number>();
      mine.set(key, Math.min(mine.get(key) ?? Infinity, hoursBetween(pr.ghCreatedAt, r.submittedAt)));
      first.set(r.reviewerLogin, mine);
    }
    reviewers = [...first]
      .map(([login, m]) => ({ login, reviews: m.size, medianHoursToReview: round1(median([...m.values()])) }))
      .sort((a, b) => (b.medianHoursToReview ?? 0) - (a.medianHoursToReview ?? 0));
  }

  return {
    opened: opened.length,
    merged: merged.length,
    unreviewed: opened.filter((p) => !p.firstReviewAt).length,
    timeToFirstReview: { medianHours: round1(median(ttfr)), p90Hours: round1(quantile(ttfr, 0.9)), sample: ttfr.length },
    cycleTime: { medianHours: round1(median(cycle)), p90Hours: round1(quantile(cycle, 0.9)), sample: cycle.length },
    sizes,
    trend: [...byWeek].map(([week, v]) => ({ week, merged: v.merged, medianHoursToFirstReview: round1(median(v.ttfr)) })),
    repos: [...repoWaits]
      .map(([repo, waits]) => ({ repo, prs: waits.length, medianHoursToFirstReview: round1(median(waits)) }))
      .sort((a, b) => (b.medianHoursToFirstReview ?? 0) - (a.medianHoursToFirstReview ?? 0)),
    reviewers,
  };
}

export type Insights = ReturnType<typeof computeInsights>;
