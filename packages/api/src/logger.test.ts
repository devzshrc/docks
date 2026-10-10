import assert from "node:assert/strict";
import { test } from "node:test";
import {
  correlationId,
  currentRequestId,
  logError,
  logEvent,
  withLogContext,
} from "./logger.js";

test("request contexts remain isolated across concurrent asynchronous work", async () => {
  const results = await Promise.all(
    ["first", "second"].map((requestId) =>
      withLogContext({ requestId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return currentRequestId();
      }),
    ),
  );
  assert.deepEqual(results, ["first", "second"]);
  assert.equal(currentRequestId(), undefined);
});

test("invalid request ids are replaced and diagnostics never disclose exception bodies", () => {
  assert.equal(correlationId("valid-id"), "valid-id");
  assert.match(correlationId("token=secret\n"), /^[a-f0-9-]{36}$/);
  const rows: string[] = [];
  const previous = { log: console.log, error: console.error };
  console.log = console.error = (value: unknown) => {
    rows.push(String(value));
  };
  try {
    logEvent("info", "test", {
      message: "Bearer abc.secret token=private user@example.com",
    });
    logError("failed", new Error("customer payload=private"));
    assert.ok(!rows.join("").includes("private"));
    assert.ok(!rows.join("").includes("user@example.com"));
    assert.equal(JSON.parse(rows[1]!).errorType, "Error");
    console.log = () => {
      throw new Error("broken sink");
    };
    assert.doesNotThrow(() => logEvent("info", "sink.failure"));
  } finally {
    Object.assign(console, previous);
  }
});
