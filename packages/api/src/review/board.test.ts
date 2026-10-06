import assert from "node:assert/strict";
import { test } from "node:test";
import { boardFilters, filterBoard, sizeOf, type BoardRow } from "./board.js";
import { isStuck } from "./columns.js";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);
const row = (number: number, extra: Partial<BoardRow> = {}): BoardRow => ({
  repoId: 1,
  number,
  authorLogin: "ana",
  requestedReviewers: [],
  reviewColumn: "waiting",
  claimedBy: null,
  lastActivityAt: hoursAgo(1),
  additions: 10,
  deletions: 0,
  labels: [],
  priority: false,
  draft: false,
  ci: "pass",
  ...extra,
});
const ctx = { me: "bo", teamLogins: null, stuckHours: 24, now: NOW };
const ids = (rows: { number: number }[]) => rows.map((r) => r.number);
const f = (x: object = {}) => boardFilters.parse(x);

test("size buckets", () => {
  assert.deepEqual([sizeOf({ additions: 99, deletions: 0 }), sizeOf({ additions: 60, deletions: 40 }), sizeOf({ additions: 500, deletions: 0 })], ["S", "M", "L"]);
});

test("stuck threshold is configurable", () => {
  assert.equal(isStuck("waiting", hoursAgo(30), 24, NOW), true);
  assert.equal(isStuck("waiting", hoursAgo(30), 48, NOW), false);
  assert.equal(isStuck("approved", hoursAgo(300), 24, NOW), false);
});

test("drafts hidden unless asked; filters combine", () => {
  const rows = [
    row(1, { draft: true }),
    row(2, { authorLogin: "Bo" }),
    row(3, { requestedReviewers: ["bo"], labels: ["bug"] }),
    row(4, { repoId: 2, additions: 900 }),
  ];
  assert.deepEqual(ids(filterBoard(rows, f(), ctx)), [2, 3, 4]);
  assert.deepEqual(ids(filterBoard(rows, f({ includeDrafts: true }), ctx)).sort(), [1, 2, 3, 4]);
  assert.deepEqual(ids(filterBoard(rows, f({ mine: true }), ctx)), [2], "author match is case-insensitive");
  assert.deepEqual(ids(filterBoard(rows, f({ waitingOnMe: true }), ctx)), [3]);
  assert.deepEqual(ids(filterBoard(rows, f({ label: "bug" }), ctx)), [3]);
  assert.deepEqual(ids(filterBoard(rows, f({ repoIds: [2], size: "L" }), ctx)), [4]);
  assert.deepEqual(ids(filterBoard(rows, f({ mine: true }), { ...ctx, me: null })), [], "no GitHub link, no 'mine'");
});

test("team filter matches author or requested reviewer", () => {
  const rows = [row(1, { authorLogin: "cy" }), row(2, { requestedReviewers: ["Cy"] }), row(3)];
  assert.deepEqual(ids(filterBoard(rows, f(), { ...ctx, teamLogins: new Set(["cy"]) })), [1, 2]);
});

test("claimed PRs leave 'needs reviewer'; sorts", () => {
  const rows = [
    row(1, { reviewColumn: "needs_reviewer", claimedBy: "u1", lastActivityAt: hoursAgo(5) }),
    row(2, { lastActivityAt: hoursAgo(50), additions: 5 }),
    row(3, { priority: true, additions: 400 }),
    row(4, { ci: "fail", lastActivityAt: hoursAgo(2), additions: 50 }),
  ];
  const out = filterBoard(rows, f(), ctx);
  assert.equal(out.find((r) => r.number === 1)!.column, "waiting");
  assert.deepEqual(ids(out), [3, 2, 1, 4], "default: priority first, then oldest");
  assert.deepEqual(ids(filterBoard(rows, f({ sort: "biggest" }), ctx)), [3, 4, 1, 2]);
  assert.deepEqual(ids(filterBoard(rows, f({ sort: "risk" }), ctx)), [2, 4, 3, 1], "stuck, then failing CI, then priority");
});
