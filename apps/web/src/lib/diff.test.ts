import assert from "node:assert"
import { test } from "node:test"
import { commentLabel, pairChanges, parsePatch, withContext, wordRange } from "./diff"
test("diff helpers", () => {
const l = parsePatch("@@ -5,2 +5,2 @@\n-const a = foo(1)\n+const a = bar(1)\n ctx")
const p = pairChanges(l)
assert.equal(p.get(l[1]!), l[2])
const t = "const a = bar(1)"
assert.deepEqual(wordRange(t, "const a = foo(1)")!.map((i) => i), [10, 13])
assert.equal(wordRange("abc", "xyz"), null)
const ctx = withContext(l, ["l1", "l2", "l3", "l4"], { 0: 3 })
assert.deepEqual(ctx.filter((x) => x.extra).map((x) => [x.newNo, x.oldNo, x.text]), [[2, 2, "l2"], [3, 3, "l3"], [4, 4, "l4"]])
  assert.equal(commentLabel("**blocking:** fix this"), "blocking")
  assert.equal(commentLabel("nit (non-blocking): spacing"), "nit")
  assert.equal(commentLabel("looks good"), null)
})
