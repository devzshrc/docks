import assert from "node:assert/strict";
import { test } from "node:test";
import { computeInsights, quantile, weekStart, type InsightPr } from "./insights.js";

const T0 = Date.parse("2026-09-01T00:00:00Z");
const h = (hours: number) => new Date(T0 + hours * 3_600_000);
const pr = (number: number, x: Partial<InsightPr>): InsightPr => ({
  repo: "a/b",
  number,
  authorLogin: "ana",
  ghCreatedAt: h(0),
  mergedAt: null,
  firstReviewAt: null,
  additions: 10,
  deletions: 0,
  ...x,
});

test("quantile interpolates; empty is null", () => {
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile([1, 3], 0.5), 2);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.9), 4.6);
});

test("weekStart is the Monday (UTC)", () => {
  assert.equal(weekStart(new Date("2026-10-07T12:00:00Z")), "2026-10-05"); // Wednesday
  assert.equal(weekStart(new Date("2026-10-05T00:00:00Z")), "2026-10-05"); // Monday
  assert.equal(weekStart(new Date("2026-10-11T23:00:00Z")), "2026-10-05"); // Sunday
});

test("time to first review, cycle time, sizes, unreviewed", () => {
  const prs = [
    pr(1, { firstReviewAt: h(2), mergedAt: h(10) }),
    pr(2, { firstReviewAt: h(6), mergedAt: h(30), additions: 600 }),
    pr(3, {}), // never reviewed
    pr(4, { ghCreatedAt: h(-1000), firstReviewAt: h(-990) }), // outside range
  ];
  const r = computeInsights(prs, [], { from: h(-1), to: h(100) });
  assert.equal(r.opened, 3);
  assert.equal(r.merged, 2);
  assert.equal(r.unreviewed, 1);
  assert.deepEqual(r.timeToFirstReview, { medianHours: 4, p90Hours: 5.6, sample: 2 });
  assert.equal(r.cycleTime.medianHours, 20);
  assert.deepEqual(r.sizes, { S: 2, M: 0, L: 1 });
});

test("per-person only when asked; author's own reviews ignored; first review per PR", () => {
  const prs = [pr(1, { firstReviewAt: h(3) })];
  const reviews = [
    { repo: "a/b", prNumber: 1, reviewerLogin: "bo", submittedAt: h(5) },
    { repo: "a/b", prNumber: 1, reviewerLogin: "bo", submittedAt: h(3) },
    { repo: "a/b", prNumber: 1, reviewerLogin: "Ana", submittedAt: h(1) },
  ];
  assert.equal(computeInsights(prs, reviews, { from: h(-1), to: h(100) }).reviewers, null);
  const r = computeInsights(prs, reviews, { from: h(-1), to: h(100), perPerson: true });
  assert.deepEqual(r.reviewers, [{ login: "bo", reviews: 1, medianHoursToReview: 3 }]);
});

test("trend has one bucket per week", () => {
  const r = computeInsights([pr(1, { firstReviewAt: h(1), mergedAt: h(2) })], [], { from: h(-1), to: h(24), weeks: 4 });
  assert.equal(r.trend.length, 4);
  assert.equal(r.trend.reduce((n, w) => n + w.merged, 0), 1);
});
