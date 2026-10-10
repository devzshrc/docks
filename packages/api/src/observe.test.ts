import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_ERROR_MESSAGE_LENGTH,
  errorHash,
  normalizeErrorMessage,
} from "./observe.js";

test("normalizeErrorMessage strips ids so the same bug groups", () => {
  const a = normalizeErrorMessage(
    "Connection failed for user 12345 at 0xdeadBEEF",
  );
  const b = normalizeErrorMessage(
    "Connection failed for user 67890 at 0xCafe1234",
  );
  assert.equal(a, b);
  assert.ok(!/\d/.test(a), "no digits should survive normalization");
});

test("normalizeErrorMessage strips uuids and long hex", () => {
  const a = normalizeErrorMessage(
    "Job 550e8400-e29b-41d4-a716-446655440000 failed on commit abc123def456",
  );
  const b = normalizeErrorMessage(
    "Job 123e4567-e89b-12d3-a456-426614174000 failed on commit 789fff000aaa",
  );
  assert.equal(a, b);
});

test("errorHash is stable per bug and distinct per bug", () => {
  assert.equal(
    errorHash("boom on record 1"),
    errorHash("boom on record 2"),
    "same bug with different ids must share a hash",
  );
  assert.notEqual(errorHash("boom"), errorHash("bust"));
});

test("normalizeErrorMessage caps length", () => {
  assert.ok(
    normalizeErrorMessage("x".repeat(5000)).length <= MAX_ERROR_MESSAGE_LENGTH,
  );
});
