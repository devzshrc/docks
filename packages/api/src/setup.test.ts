import assert from "node:assert/strict";
import { test } from "node:test";
import { explainJobError, inviteCandidates, missingPermissions, webhookCheck, webhookTestVerdict } from "./setup.js";

const now = new Date("2026-10-20T12:00:00Z");
const at = (h: number) => new Date(now.getTime() - h * 3_600_000);

test("webhookCheck: none, healthy, signature failures, stale", () => {
  assert.equal(webhookCheck([], now).status, "warn");
  const ok = webhookCheck([{ result: "ok", receivedAt: at(0.1), reason: null }], now);
  assert.equal(ok.status, "ok");
  assert.match(ok.detail, /6 min ago/);
  const bad = webhookCheck([{ result: "signature_rejected", receivedAt: at(1), reason: "sig" }, { result: "ok", receivedAt: at(2), reason: null }], now);
  assert.equal(bad.status, "fail");
  assert.match(bad.detail, /GITHUB_WEBHOOK_SECRET/);
  assert.equal(webhookCheck([{ result: "ok", receivedAt: at(24 * 10), reason: null }], now).status, "warn");
});

test("missingPermissions lists what's absent or too weak, with why", () => {
  assert.deepEqual(missingPermissions({ pull_requests: "write", contents: "read", checks: "read", metadata: "read", issues: "write" }), []);
  const missing = missingPermissions({ pull_requests: "read", metadata: "read" });
  assert.equal(missing.length, 4);
  assert.match(missing[0]!, /pull requests \(write\) to approve/);
});

test("inviteCandidates skips members and bots, ranks by activity", () => {
  const out = inviteCandidates(
    [{ login: "Ana", n: 3 }, { login: "ana", n: 2 }, { login: "bob", n: 9 }, { login: "dependabot", n: 50 }, { login: "ci[bot]", n: 5 }, { login: "me", n: 4 }],
    ["ME"],
  );
  assert.deepEqual(out, [{ login: "bob", activity: 9 }, { login: "Ana", activity: 5 }]);
});

test("explainJobError and webhookTestVerdict give next steps", () => {
  assert.match(explainJobError("sync_pr", "GitHub 404 /repos/a/b/pulls/1: Not Found"), /deleted, renamed/);
  assert.match(explainJobError("sync_repo", "GitHub 403 /x: {\"message\":\"Resource not accessible by integration\"}"), /permission/);
  assert.match(explainJobError("generate_guide", "boom"), /AI walkthrough/);
  assert.equal(webhookTestVerdict({ configuredUrl: "https://old.example/webhooks/github", expectedUrl: "https://api.example/webhooks/github", githubStatusCode: 202, receivedByUs: false }).status, "fail");
  assert.equal(webhookTestVerdict({ configuredUrl: "https://api.example/webhooks/github/", expectedUrl: "https://api.example/webhooks/github", githubStatusCode: 202, receivedByUs: true }).status, "ok");
  assert.match(webhookTestVerdict({ configuredUrl: null, expectedUrl: "x", githubStatusCode: 401, receivedByUs: false }).detail, /secret/);
});
