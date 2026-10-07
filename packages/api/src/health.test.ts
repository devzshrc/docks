import assert from "node:assert/strict";
import { test } from "node:test";
import { dayStatus, healthDays } from "./health.js";

test("day status from job outcomes", () => {
  assert.equal(dayStatus(0, 0), "none");
  assert.equal(dayStatus(10, 0), "up");
  assert.equal(dayStatus(9, 1), "degraded");
  assert.equal(dayStatus(1, 1), "down");
  assert.equal(dayStatus(0, 3), "down");
});

test("fills a continuous window, oldest first, ending today", () => {
  const days = healthDays([{ date: "2026-10-06", done: 8, failed: 2 }, { date: "2026-10-07", done: 5, failed: 0 }], new Date("2026-10-07T10:00:00Z"), 4);
  assert.deepEqual(days.map((d) => [d.date, d.status]), [["2026-10-04", "none"], ["2026-10-05", "none"], ["2026-10-06", "degraded"], ["2026-10-07", "up"]]);
  assert.equal(days[2]!.uptime, 80);
  assert.equal(days[2]!.incidents?.[0]?.title, "2 of 10 sync jobs failed");
  assert.equal(days[3]!.incidents, undefined);
});
