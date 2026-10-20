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

test("explainGithub turns common refusals into next steps", async () => {
  const { explainGithub } = await import("./errors.js");
  const body = (message: string) => `GitHub 405 /x: ${JSON.stringify({ message })}`;
  assert.equal(
    explainGithub(405, body("At least 2 approving reviews are required by reviewers with write access.")),
    "Merge blocked by branch protection: 2 approving reviews are required.",
  );
  assert.match(explainGithub(405, body("Pull Request is not mergeable")), /merge conflicts/);
  assert.match(explainGithub(409, body("Head branch was modified. Review and try the merge again.")), /Refresh/);
  assert.match(explainGithub(403, body("Resource not accessible by integration")), /accept the App's requested permissions/);
  assert.match(explainGithub(403, body("API rate limit exceeded for installation ID 1.")), /rate-limiting/);
  assert.match(explainGithub(429, "GitHub 429 /x: slow down"), /rate-limiting/);
  assert.match(explainGithub(401, body("Bad credentials")), /Reconnect GitHub/);
  assert.match(explainGithub(502, "GitHub 502 /x: <html>"), /having trouble/);
  // Unknown reasons still show GitHub's own words.
  assert.equal(explainGithub(422, body("Something specific happened.")), "Something specific happened.");
});
