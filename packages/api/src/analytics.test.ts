import assert from "node:assert/strict";
import { test } from "node:test";
import { computeMetrics } from "./analytics.js";

const NOW = new Date("2026-10-07T12:00:00Z");
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000);

test("activation needs a workspace and GitHub within 24h of signup", () => {
  const events = [
    { userId: "a", name: "signed_up", at: at(100) },
    { userId: "a", name: "workspace_created", at: at(99) },
    { userId: "a", name: "github_installed", at: at(90) },
    { userId: "b", name: "signed_up", at: at(100) },
    { userId: "b", name: "workspace_created", at: at(99) },
    { userId: "b", name: "github_connected", at: at(50) }, // 50h later: too late
    { userId: "c", name: "signed_up", at: at(24 * 40) }, // older than 30 days
  ];
  const m = computeMetrics(events, NOW);
  assert.equal(m.signups30d, 2);
  assert.equal(m.activated30d, 1);
  assert.equal(m.activationRate, 50);
});

test("weekly active reviewers are distinct people; reviews are counted", () => {
  const events = [
    { userId: "a", name: "review_submitted", at: at(1) },
    { userId: "a", name: "review_submitted", at: at(2) },
    { userId: "b", name: "pr_opened", at: at(3) },
    { userId: "c", name: "board_viewed", at: at(3) },
  ];
  const m = computeMetrics(events, NOW, 2);
  const thisWeek = m.weeks.at(-1)!;
  assert.equal(thisWeek.activeReviewers, 2);
  assert.equal(thisWeek.reviews, 2);
  assert.equal(computeMetrics([], NOW).activationRate, null);
});
