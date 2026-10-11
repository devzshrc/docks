import assert from "node:assert/strict";
import { test } from "node:test";
import { weekInsight } from "./trend-insight";

const merged = [0, 0, 0, 1, 2, 3, 4, 2, 3, 5, 2, 3];

test("peaks and lows are called out, coloured by which direction is good", () => {
  assert.equal(weekInsight(merged, 9).headline, "Highest in 12 weeks");
  assert.equal(weekInsight(merged, 9).headlineTone, "good");
  assert.equal(weekInsight(merged, 9, { polarity: "lower" }).headlineTone, "bad");
});

test("tied extremes are not called the highest or lowest", () => {
  assert.notEqual(weekInsight([1, 4, 4, 2], 1).headline, "Highest in 4 weeks");
});

test("first activity after an empty run", () => {
  assert.equal(weekInsight(merged, 3).headline, "First activity in this window");
});

test("large swings against the previous week", () => {
  assert.equal(weekInsight(merged, 4).headline, "2× the week before");
  assert.equal(weekInsight([3, 3, 4, 1, 3], 3).headline, "Lowest in 5 weeks");
  assert.equal(weekInsight([2, 4, 4, 2, 4], 3).headline, "Down 50% from the week before");
  assert.equal(weekInsight(merged, 10).delta, -3);
  assert.equal(weekInsight(merged, 10).deltaTone, "bad");
});

test("otherwise compares with the window average", () => {
  const i = weekInsight([2, 3, 3, 2, 3], 1);
  assert.equal(i.headline, "Above the 5-week average of 2.6");
  assert.equal(weekInsight([2, 2, 2, 2], 1).headline, "In line with the 4-week average");
  assert.equal(weekInsight([2, null, 2], 1).headline, "No data for this week");
});
