import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRecovery } from "./review-session";

test("corrupt local recovery never replaces valid server state", () => {
  assert.equal(parseRecovery("{"), null);
  assert.equal(parseRecovery(JSON.stringify({ version: 1, dirty: true, data: { textDrafts: {}, pending: [] } })), null);
  const value = { version: 1, dirty: true, data: { textDrafts: { summary: "Draft" }, pending: [], checklist: { revision: "sha", checked: [] }, lastLocation: null } };
  assert.deepEqual(parseRecovery(JSON.stringify(value)), value);
});
