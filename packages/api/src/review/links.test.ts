import assert from "node:assert/strict";
import { test } from "node:test";
import { issueFromBranch, issueMentions, linearIdFromBranch, linearIds } from "./links.js";

test("finds Linear ids in text and ignores lookalikes", () => {
  assert.deepEqual(linearIds("Fixes ENG-123 and PAY-7", "uses UTF-8 and SHA-256"), ["ENG-123", "PAY-7"]);
  assert.deepEqual(linearIds(null, undefined), []);
});

test("Linear id from a branch name", () => {
  assert.equal(linearIdFromBranch("eng-123-fix-login"), "ENG-123");
  assert.equal(linearIdFromBranch("feature/pay-7"), "PAY-7");
  assert.equal(linearIdFromBranch("main"), null);
  assert.equal(linearIdFromBranch("utf-8-support"), null);
});

test("issue mentions skip other repos and the PR itself", () => {
  assert.deepEqual(issueMentions("See #12, closes #418 and other/repo#9", 418), [12]);
});

test("issue number from a branch name", () => {
  assert.equal(issueFromBranch("fix/123-login-fails"), 123);
  assert.equal(issueFromBranch("feat/45"), 45);
  assert.equal(issueFromBranch("user/issue-9-thing"), 9);
  assert.equal(issueFromBranch("release/2024-10"), null);
  assert.equal(issueFromBranch("main"), null);
});
