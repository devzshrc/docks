import assert from "node:assert/strict";
import { test } from "node:test";
import { githubReason } from "./errors.js";

test("uses the specific error when message is generic", () => {
  const raw = `GitHub 422 /repos/a/b/pulls/1/reviews: {"message":"Unprocessable Entity","errors":["Review comment line must be part of the diff"]}`;
  assert.equal(githubReason(raw), "Review comment line must be part of the diff");
});

test("describes field errors", () => {
  const raw = `GitHub 422 /repos/a/b/issues: {"message":"Validation Failed","errors":[{"resource":"Issue","field":"assignees","code":"invalid","value":"x"}]}`;
  assert.equal(githubReason(raw), "Issue assignees is invalid");
});

test("keeps a specific message", () => {
  const raw = `GitHub 422 /x: {"message":"Review cannot be requested from pull request author."}`;
  assert.equal(githubReason(raw), "Review cannot be requested from pull request author.");
});

test("falls back for generic or non-JSON bodies", () => {
  assert.match(githubReason(`GitHub 422 /x: {"message":"Unprocessable Entity"}`), /couldn't process/);
  assert.match(githubReason("GitHub 502 /x: <html>"), /couldn't process/);
});

test("cleans up GitHub's own-PR wording", () => {
  const raw = `GitHub 422 /x: {"message":"Unprocessable Entity","errors":["Review Can not approve your own pull request"]}`;
  assert.equal(githubReason(raw), "You can't approve your own pull request");
});
