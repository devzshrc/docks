import assert from "node:assert/strict";
import { test } from "node:test";
import { ageBucket, issueRefs, isStale, lastWeeks, median, statusOf, weekStart } from "./issues-logic.js";

test("finds closing keywords and plain mentions", () => {
  const r = issueRefs("Fixes #12, closes owner/repo#7 and resolved: #3. See also #99 and (#5).");
  assert.deepEqual(r.closes.sort((a, b) => a - b), [3, 7, 12]);
  assert.deepEqual(r.mentions.sort((a, b) => a - b), [5, 99]);
});

test("ignores #123 inside words and urls", () => {
  assert.deepEqual(issueRefs("see https://x.com/a#12 and abc#4"), { closes: [], mentions: [] });
});

test("derives board status from GitHub", () => {
  assert.equal(statusOf({ state: "closed", assignees: [] }, []), "done");
  assert.equal(statusOf({ state: "open", assignees: [] }, []), "todo");
  assert.equal(statusOf({ state: "open", assignees: ["a"] }, []), "in_progress");
  assert.equal(statusOf({ state: "open", assignees: [] }, [{ state: "open", draft: true }]), "in_progress");
  assert.equal(statusOf({ state: "open", assignees: ["a"] }, [{ state: "open", draft: false }]), "in_review");
  assert.equal(statusOf({ state: "open", assignees: [] }, [{ state: "merged", draft: false }]), "todo");
});

test("staleness and median", () => {
  const now = Date.parse("2026-10-08T00:00:00Z");
  assert.equal(isStale(new Date("2026-09-01T00:00:00Z"), 14, now), true);
  assert.equal(isStale(new Date("2026-10-05T00:00:00Z"), 14, now), false);
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 10]), 2.5);
});

test("weeks start on Monday", () => {
  assert.equal(weekStart(new Date("2026-10-08T12:00:00Z")), "2026-10-05");
  assert.deepEqual(lastWeeks(3, new Date("2026-10-08T12:00:00Z")), ["2026-09-21", "2026-09-28", "2026-10-05"]);
});

test("age buckets", () => {
  const now = Date.parse("2026-10-08T00:00:00Z");
  assert.equal(ageBucket(new Date("2026-10-05T00:00:00Z"), now), "week");
  assert.equal(ageBucket(new Date("2026-09-20T00:00:00Z"), now), "month");
  assert.equal(ageBucket(new Date("2026-08-01T00:00:00Z"), now), "quarter");
  assert.equal(ageBucket(new Date("2026-01-01T00:00:00Z"), now), "older");
});
