import { test } from "node:test"
import assert from "node:assert/strict"

import { parsePatch } from "./diff"
import { formattingOnly, reviewMinutes, riskSummary, riskyLines } from "./review-signals"

const patch = (lines: string[]) => parsePatch(["@@ -1,3 +1,3 @@", ...lines].join("\n"))

test("flags auth and unsafe additions in source, not in tests", () => {
  const lines = patch(["+if (!session.user.isAdmin) throw new Error()", "+el.innerHTML = html", " ctx"])
  assert.deepEqual(riskSummary(riskyLines("src/admin.ts", lines)), ["unsafe", "auth"])
  assert.deepEqual(new Set(riskyLines("src/admin.ts", lines).values()), new Set(["auth", "unsafe"]))
  assert.equal(riskyLines("src/admin.test.ts", lines).size, 0)
})

test("flags removed tests only in test files", () => {
  const lines = patch(["-test('limits', () => {", "-  expect(x).toBe(1)"])
  assert.equal(riskyLines("src/a.test.ts", lines).size, 2)
  assert.equal(riskyLines("src/a.ts", lines).size, 0)
})

test("detects hardcoded secrets anywhere", () => {
  const lines = patch(['+const apiKey = "sk_live_abcdefghijkl"'])
  assert.deepEqual(riskSummary(riskyLines("docs/setup.md", lines)), ["secrets"])
})

test("formatting-only changes are recognised", () => {
  assert.equal(formattingOnly(patch(["-const a = {b:1}", "+const a = { b: 1 }"])), true)
  assert.equal(formattingOnly(patch(["-const a = 1", "+const a = 2"])), false)
  assert.equal(formattingOnly(patch(["+const a = 1"])), false)
})

test("review time ignores noise and discounts tests", () => {
  assert.equal(reviewMinutes([{ additions: 120, deletions: 0, tier: "core" }]), 10)
  assert.equal(reviewMinutes([{ additions: 5000, deletions: 0, tier: "noise" }]), 1)
  assert.equal(reviewMinutes([{ additions: 240, deletions: 0, tier: "test" }]), 10)
})
