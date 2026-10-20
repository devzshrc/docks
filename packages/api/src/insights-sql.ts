import { db, schema } from "@docks/db";
import { sql, type SQL } from "drizzle-orm";
import { weekStart, type Insights } from "./insights.js";
import { SIZES } from "./review/board.js";

/**
 * Review insights computed in Postgres (aggregates and percentile_cont), so a
 * large workspace doesn't pull every PR into memory. Same output as
 * computeInsights, which stays as the reference the integration test checks against.
 */
export async function insightsFromSql(
  repos: { id: number; fullName: string }[],
  opts: { from: Date; to: Date; weeks?: number; perPerson?: boolean; teamLogins?: string[] | null },
): Promise<Insights> {
  const weeks = opts.weeks ?? 12;
  const weekKeys: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) weekKeys.push(weekStart(new Date(opts.to.getTime() - i * 7 * 24 * 3_600_000)));
  const empty: Insights = {
    opened: 0,
    merged: 0,
    unreviewed: 0,
    timeToFirstReview: { medianHours: null, p90Hours: null, sample: 0 },
    cycleTime: { medianHours: null, p90Hours: null, sample: 0 },
    sizes: { S: 0, M: 0, L: 0 },
    trend: weekKeys.map((week) => ({ week, merged: 0, medianHoursToFirstReview: null })),
    repos: [],
    reviewers: opts.perPerson ? [] : null,
  };
  if (!repos.length || opts.teamLogins?.length === 0) return empty;

  const list = (xs: (string | number)[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);
  const from = opts.from.toISOString();
  const to = opts.to.toISOString();
  const trendStart = new Date(opts.to.getTime() - weeks * 7 * 24 * 3_600_000).toISOString();
  const p = schema.pullRequest;
  const scope: SQL = sql`${p.repoId} IN (${list(repos.map((r) => r.id))})${
    opts.teamLogins ? sql` AND lower(${p.authorLogin}) IN (${list(opts.teamLogins.map((l) => l.toLowerCase()))})` : sql``
  }`;
  const hours = (a: SQL, b: SQL) => sql`extract(epoch from (${b} - ${a})) / 3600.0`;
  const ttfr = hours(sql`${p.ghCreatedAt}`, sql`${p.firstReviewAt}`);
  const cycle = hours(sql`${p.ghCreatedAt}`, sql`${p.mergedAt}`);
  const openedInRange = sql`${p.ghCreatedAt} >= ${from}::timestamptz AND ${p.ghCreatedAt} <= ${to}::timestamptz`;
  const mergedInRange = sql`${p.mergedAt} >= ${from}::timestamptz AND ${p.mergedAt} <= ${to}::timestamptz`;
  const week = (col: SQL) => sql`to_char(date_trunc('week', ${col} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;
  const lines = sql`(${p.additions} + ${p.deletions})`;

  type Num = number | string | null;
  const [opened, merged, trendMerged, trendWait, byRepo, reviewers] = await Promise.all([
    db.execute<{ n: number; unreviewed: number; med: Num; p90: Num; sample: number; s: number; m: number; l: number }>(sql`
      SELECT count(*)::int AS n,
        count(*) FILTER (WHERE ${p.firstReviewAt} IS NULL)::int AS unreviewed,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY ${ttfr}) FILTER (WHERE ${p.firstReviewAt} IS NOT NULL) AS med,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY ${ttfr}) FILTER (WHERE ${p.firstReviewAt} IS NOT NULL) AS p90,
        count(*) FILTER (WHERE ${p.firstReviewAt} IS NOT NULL)::int AS sample,
        count(*) FILTER (WHERE ${lines} < ${SIZES.S})::int AS s,
        count(*) FILTER (WHERE ${lines} >= ${SIZES.S} AND ${lines} < ${SIZES.M})::int AS m,
        count(*) FILTER (WHERE ${lines} >= ${SIZES.M})::int AS l
      FROM ${p} WHERE ${scope} AND ${openedInRange}`),
    db.execute<{ n: number; med: Num; p90: Num; sample: number }>(sql`
      SELECT count(*)::int AS n,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY ${cycle}) FILTER (WHERE ${p.ghCreatedAt} IS NOT NULL) AS med,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY ${cycle}) FILTER (WHERE ${p.ghCreatedAt} IS NOT NULL) AS p90,
        count(*) FILTER (WHERE ${p.ghCreatedAt} IS NOT NULL)::int AS sample
      FROM ${p} WHERE ${scope} AND ${mergedInRange}`),
    db.execute<{ week: string; n: number }>(sql`
      SELECT ${week(sql`${p.mergedAt}`)} AS week, count(*)::int AS n
      FROM ${p} WHERE ${scope} AND ${p.mergedAt} >= ${trendStart}::timestamptz AND ${p.mergedAt} <= ${to}::timestamptz
      GROUP BY 1`),
    db.execute<{ week: string; med: Num }>(sql`
      SELECT ${week(sql`${p.ghCreatedAt}`)} AS week, percentile_cont(0.5) WITHIN GROUP (ORDER BY ${ttfr}) AS med
      FROM ${p} WHERE ${scope} AND ${p.firstReviewAt} IS NOT NULL
        AND ${p.ghCreatedAt} >= ${trendStart}::timestamptz AND ${p.ghCreatedAt} <= ${to}::timestamptz
      GROUP BY 1`),
    db.execute<{ repo_id: number | string; n: number; med: Num }>(sql`
      SELECT ${p.repoId} AS repo_id, count(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY ${ttfr}) AS med
      FROM ${p} WHERE ${scope} AND ${openedInRange} AND ${p.firstReviewAt} IS NOT NULL
      GROUP BY 1`),
    opts.perPerson
      ? db.execute<{ login: string; n: number; med: Num }>(sql`
          WITH firsts AS (
            SELECT r.reviewer_login AS login, r.repo_id, r.pr_number,
              min(extract(epoch from (r.submitted_at - pr.gh_created_at)) / 3600.0) AS h
            FROM ${schema.prReview} r
            JOIN ${p} pr ON pr.repo_id = r.repo_id AND pr.number = r.pr_number
            WHERE r.repo_id IN (${list(repos.map((x) => x.id))})
              AND r.submitted_at >= ${from}::timestamptz AND r.submitted_at <= ${to}::timestamptz
              AND pr.gh_created_at IS NOT NULL
              AND lower(pr.author_login) <> lower(r.reviewer_login)
              ${opts.teamLogins ? sql`AND lower(r.reviewer_login) IN (${list(opts.teamLogins.map((l) => l.toLowerCase()))}) AND lower(pr.author_login) IN (${list(opts.teamLogins.map((l) => l.toLowerCase()))})` : sql``}
            GROUP BY 1, 2, 3
          )
          SELECT login, count(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY h) AS med
          FROM firsts GROUP BY 1`)
      : null,
  ]);

  const num = (v: Num) => (v === null ? null : Math.round(Number(v) * 10) / 10);
  const o = opened.rows[0]!;
  const mg = merged.rows[0]!;
  const mergedByWeek = new Map(trendMerged.rows.map((r) => [r.week, r.n]));
  const waitByWeek = new Map(trendWait.rows.map((r) => [r.week, num(r.med)]));
  const name = new Map(repos.map((r) => [r.id, r.fullName]));
  return {
    opened: o.n,
    merged: mg.n,
    unreviewed: o.unreviewed,
    timeToFirstReview: { medianHours: num(o.med), p90Hours: num(o.p90), sample: o.sample },
    cycleTime: { medianHours: num(mg.med), p90Hours: num(mg.p90), sample: mg.sample },
    sizes: { S: o.s, M: o.m, L: o.l },
    trend: weekKeys.map((week) => ({
      week,
      merged: mergedByWeek.get(week) ?? 0,
      medianHoursToFirstReview: waitByWeek.get(week) ?? null,
    })),
    repos: byRepo.rows
      .map((r) => ({ repo: name.get(Number(r.repo_id))!, prs: r.n, medianHoursToFirstReview: num(r.med) }))
      .sort((a, b) => (b.medianHoursToFirstReview ?? 0) - (a.medianHoursToFirstReview ?? 0)),
    reviewers: reviewers
      ? reviewers.rows
          .map((r) => ({ login: r.login, reviews: r.n, medianHoursToReview: num(r.med) }))
          .sort((a, b) => (b.medianHoursToReview ?? 0) - (a.medianHoursToReview ?? 0))
      : null,
  };
}
