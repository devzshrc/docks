import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "./app.js";
import { sendHeartbeat } from "./heartbeat.js";

test("readiness reports dependency failure without leaking errors and exposes correlation", async () => {
  const failed = await createApp({ readiness: async () => false }).request(
    "/readyz",
    {
      headers: {
        "x-request-id": "test-correlation",
        origin: "http://localhost:3000",
      },
    },
  );
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { status: "unavailable" });
  assert.equal(failed.headers.get("cache-control"), "no-store");
  assert.equal(failed.headers.get("x-request-id"), "test-correlation");
  assert.match(
    failed.headers.get("access-control-expose-headers")!,
    /x-request-id/,
  );
  const healthy = await createApp({ readiness: async () => true }).request(
    "/readyz",
  );
  assert.equal(healthy.status, 200);
  assert.match(healthy.headers.get("x-request-id")!, /^[a-f0-9-]{36}$/);
});

test("heartbeat is opt-in and failed delivery does not throw or expose its secret URL", async () => {
  const original = globalThis.fetch;
  const previous = console.error;
  let calls = 0;
  const logs: string[] = [];
  globalThis.fetch = async () => {
    calls++;
    throw new Error("https://monitor.example/private-token");
  };
  console.error = (value: unknown) => {
    logs.push(String(value));
  };
  try {
    await sendHeartbeat(undefined);
    assert.equal(calls, 0);
    await sendHeartbeat("http://monitor.example/private-token");
    assert.equal(calls, 0);
    await sendHeartbeat("https://monitor.example/private-token");
    assert.equal(calls, 1);
    assert.ok(!logs.join("").includes("private-token"));
  } finally {
    globalThis.fetch = original;
    console.error = previous;
  }
});

test("batched RPC logging records logical outcomes without storing inputs", async () => {
  const rows: string[] = [];
  const previous = { log: console.log, warn: console.warn };
  console.log = console.warn = (value: unknown) => {
    rows.push(String(value));
  };
  try {
    const input = encodeURIComponent(
      JSON.stringify({
        1: { json: { message: "", private: "never-log-this" } },
      }),
    );
    const response = await createApp().request(
      `/trpc/health.check,health.echo?batch=1&input=${input}`,
      { headers: { "x-request-id": "batch-proof" } },
    );
    assert.equal(response.status, 207);
    assert.equal(response.headers.get("x-request-id"), "batch-proof");
    const procedures = rows
      .map((row) => JSON.parse(row))
      .filter((row) => row.event === "rpc.completed");
    assert.equal(procedures.length, 2);
    assert.deepEqual(procedures.map((row) => row.code).sort(), [
      "BAD_REQUEST",
      "OK",
    ]);
    assert.ok(procedures.every((row) => row.requestId === "batch-proof"));
    assert.ok(!rows.join("").includes("never-log-this"));
  } finally {
    Object.assign(console, previous);
  }
});
