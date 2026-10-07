import assert from "node:assert/strict"
import { test } from "node:test"
import { QueryClient } from "@tanstack/react-query"

import { applyPatch, bulkPatch, stillListed } from "../components/issues/patch"
import { optimistic } from "./optimistic"

const key = ["board"]
const filter = { queryKey: key }

test("patches the cache at once and restores it when the server refuses", async () => {
  const qc = new QueryClient()
  qc.setQueryData(key, { stars: [false, false] })
  const o = optimistic<number>(qc, [{ filter, patch: (d: { stars: boolean[] }, i) => ({ stars: d.stars.map((s, n) => (n === i ? true : s)) }) }], { toastError: false })
  const ctx = await o.onMutate(1)
  assert.deepEqual(qc.getQueryData(key), { stars: [false, true] })
  o.onError({ message: "nope" }, 1, ctx)
  assert.deepEqual(qc.getQueryData(key), { stars: [false, false] })
})

test("leaves queries alone when the patch returns undefined", async () => {
  const qc = new QueryClient()
  qc.setQueryData(key, { x: 1 })
  const ctx = await optimistic<void>(qc, [{ filter, patch: () => undefined }]).onMutate()
  assert.deepEqual(qc.getQueryData(key), { x: 1 })
  assert.equal(ctx.snapshot.length, 0)
})

test("issue edits: closing drops the row from an open list, assigning drops it from triage", () => {
  const row = { title: "t", assignees: [] as string[], labels: [{ name: "bug", color: "d73a4a" }], state: "open" as const, stateReason: null as string | null }
  const closed = applyPatch(row, { state: "closed" })
  assert.equal(closed.stateReason, "completed")
  assert.equal(stillListed(closed, { state: "open" }), false)
  assert.equal(stillListed(closed, { state: "all" }), true)
  assert.equal(stillListed(applyPatch(row, { assignees: ["a"] }), { state: "open", assignee: "none" }), false)
  assert.deepEqual(applyPatch(row, { labels: ["bug", "ui"] }).labels.map((l) => l.color), ["d73a4a", "888888"])
  assert.deepEqual(bulkPatch(row, { type: "label", label: "ui" }).labels, ["bug", "ui"])
})
