import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell } from "./evidence.js";
import { currentReadiness } from "./releases.js";
test("CSV quotes cells and prevents formula execution", () => {
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.equal(csvCell("\t+SUM(A1)"), '"\'\t+SUM(A1)"');
  assert.equal(csvCell('Hello,"world"'), '"Hello,""world"""');
});
test("release results become unknown after new commits or expiry", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const ready = {
    state: "ready" as const,
    headSha: "a",
    checkedAt: now.toISOString(),
    blockers: [],
    warnings: [],
  };
  assert.equal(currentReadiness(ready, "a", now).state, "ready");
  assert.equal(currentReadiness(ready, "b", now).state, "unknown");
  assert.equal(
    currentReadiness(ready, "a", new Date(now.getTime() + 16 * 60000)).state,
    "unknown",
  );
  assert.equal(currentReadiness(null, "a", now).state, "unknown");
});
