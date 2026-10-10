import assert from "node:assert/strict";
import { test } from "node:test";
import { redactDiagnostic, errorHash } from "./observe.js";

test("diagnostic redaction removes credentials and email addresses", () => {
  const secrets = ["ghp_canary123", "sk-canary123", "phc_canary123", "tokencanary", "passcanary", "person@example.test", "jwtcanary"];
  const source = "Authorization: Bearer jwtcanary token=tokencanary password=passcanary postgres://user:passcanary@host/db ghp_canary123 sk-canary123 phc_canary123 person@example.test";
  const safe = redactDiagnostic(source);
  for (const secret of secrets) assert.ok(!safe.includes(secret), secret);
  assert.ok(safe.includes("[redacted]"));
});

test("redaction preserves useful safe diagnostics", () => {
  assert.equal(redactDiagnostic("[job sync_repo] connection refused at line 123"), "[job sync_repo] connection refused at line 123");
  assert.equal(errorHash("request 1 failed"), errorHash("request 2 failed"));
});
