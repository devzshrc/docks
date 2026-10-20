import assert from "node:assert/strict";
import { test } from "node:test";
import { ASK_ANSWERS_PER_HOUR, ASK_ATTEMPTS_PER_HOUR, askQuotaError } from "./ask-quota.js";

test("askQuotaError: failed attempts don't use the answer quota, but the attempt cap still holds", () => {
  assert.equal(askQuotaError(undefined), null);
  assert.equal(askQuotaError({ answers: ASK_ANSWERS_PER_HOUR - 1, attempts: 50 }), null);
  assert.match(askQuotaError({ answers: ASK_ANSWERS_PER_HOUR, attempts: 30 })!, /answers this hour/);
  assert.match(askQuotaError({ answers: 2, attempts: ASK_ATTEMPTS_PER_HOUR })!, /Too many attempts/);
});
