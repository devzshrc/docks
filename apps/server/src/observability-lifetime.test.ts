import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "./app.js";

test("webhook telemetry is handed to the runtime without blocking the response", async () => {
  const tasks: Array<() => Promise<void>> = [];
  const app = createApp({ observe: (task) => tasks.push(task) });
  const response = await app.request("/webhooks/github", {
    method: "POST", body: "{}",
    headers: { "x-github-event": "ping" },
  });
  assert.equal(response.status, 401);
  assert.equal(tasks.length, 1, "runtime owns the writer's connection and lifetime");
});
