import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { closeDb, db, schema } from "@docks/db";
import { eq, inArray } from "drizzle-orm";
import { computeInsights, type Insights } from "./insights.js";
import { insightsFromSql } from "./insights-sql.js";
import { insightRows } from "./routers/insights.js";

/** Deterministic pseudo-random numbers so a failure reproduces. */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

// Order ties the same way on both sides; values are what matter.
const normalize = (i: Insights) => ({
  ...i,
  repos: [...i.repos].sort((a, b) => a.repo.localeCompare(b.repo)),
  reviewers: i.reviewers && [...i.reviewers].sort((a, b) => a.login.localeCompare(b.login)),
});

test("SQL insights match the in-memory reference", { skip: !process.env.DOCKS_TEST_DATABASE_URL }, async (t) => {
  assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
  const token = randomUUID();
  const base = Date.now() % 1_000_000_000;
  const repos = [0, 1].map((i) => ({ id: base + i, fullName: `test/${token}-${i}` }));
  const to = new Date(Date.UTC(2026, 9, 20, 12));
  const from = new Date(to.getTime() - 30 * 86_400_000);
  const trendFrom = new Date(to.getTime() - 12 * 7 * 86_400_000);
  const people = ["ana", "Ben", "cara", "dev", "eli"];
  const rand = rng(42);
  const minute = (start: Date, maxMinutes: number) => new Date(start.getTime() + Math.floor(rand() * maxMinutes) * 60_000);

  t.after(async () => {
    await db.delete(schema.prReview).where(inArray(schema.prReview.repoId, repos.map((r) => r.id)));
    await db.delete(schema.pullRequest).where(inArray(schema.pullRequest.repoId, repos.map((r) => r.id)));
    await db.delete(schema.workspace).where(eq(schema.workspace.id, token));
    await closeDb();
  });

  await db.insert(schema.workspace).values({ id: token, name: "Insights", slug: token });
  await db.insert(schema.githubInstallation).values({ id: base, workspaceId: token, accountLogin: "t", accountType: "Organization" });
  await db.insert(schema.repository).values(repos.map((r) => ({ id: r.id, installationId: base, fullName: r.fullName, defaultBranch: "main" })));

  let reviewId = base * 10;
  for (const repo of repos) {
    const prs = Array.from({ length: 120 }, (_, i) => {
      const created = minute(trendFrom, 12 * 7 * 24 * 60 - 60); // every PR inside the trend window
      const reviewed = rand() < 0.8 ? minute(created, 5 * 24 * 60) : null;
      const merged = reviewed && rand() < 0.7 ? minute(reviewed, 3 * 24 * 60) : null;
      return {
        repoId: repo.id,
        number: i + 1,
        title: `PR ${i}`,
        authorLogin: people[Math.floor(rand() * people.length)]!,
        state: merged ? ("merged" as const) : ("open" as const),
        headRef: "f",
        headSha: "a".repeat(40),
        baseRef: "main",
        reviewColumn: "waiting" as const,
        lastActivityAt: created,
        ghCreatedAt: created,
        firstReviewAt: reviewed,
        mergedAt: merged && merged <= to ? merged : null,
        additions: Math.floor(rand() * 700),
        deletions: Math.floor(rand() * 100),
      };
    });
    await db.insert(schema.pullRequest).values(prs);
    const reviews = prs.flatMap((p) =>
      p.firstReviewAt
        ? Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({
            id: reviewId++,
            repoId: repo.id,
            prNumber: p.number,
            reviewerLogin: people[Math.floor(rand() * people.length)]!,
            state: "COMMENTED",
            submittedAt: minute(p.firstReviewAt!, 2 * 24 * 60),
          }))
        : [],
    );
    await db.insert(schema.prReview).values(reviews);
  }

  const { prs, reviews } = await insightRows(repos, trendFrom);
  const reference = computeInsights(prs, reviews, { from, to, perPerson: true });
  assert.ok(reference.opened > 20 && reference.merged > 10, "fixture covers the range");
  assert.deepEqual(normalize(await insightsFromSql(repos, { from, to, perPerson: true })), normalize(reference));

  // Team filter: authors and reviewers limited to the team (case-insensitive).
  const team = ["ANA", "ben"];
  const inTeam = (l: string) => team.some((x) => x.toLowerCase() === l.toLowerCase());
  const teamRef = computeInsights(
    prs.filter((p) => inTeam(p.authorLogin)),
    reviews.filter((r) => inTeam(r.reviewerLogin)),
    { from, to, perPerson: true },
  );
  assert.deepEqual(normalize(await insightsFromSql(repos, { from, to, perPerson: true, teamLogins: team })), normalize(teamRef));

  // Weekly digest window (1 week) and no-person view.
  const weekFrom = new Date(to.getTime() - 7 * 86_400_000);
  assert.deepEqual(
    normalize(await insightsFromSql(repos, { from: weekFrom, to, weeks: 1 })),
    normalize(computeInsights(prs, reviews, { from: weekFrom, to, weeks: 1 })),
  );
});
