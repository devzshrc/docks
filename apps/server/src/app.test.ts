import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { createApp } from "./app.js";
import { rateLimit } from "./rate-limit.js";

test("HTTP health and unauthenticated admin guard return safe responses", async () => {
  const app = createApp();
  const health = await app.request("/healthz");
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.ok(body && typeof body === "object" && "status" in body);
  assert.equal(body.status, "ok");
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  const admin = await app.request("/trpc/admin.access");
  assert.equal(admin.status, 401);
  const responseBody = await admin.text();
  assert.match(responseBody, /UNAUTHORIZED/);
  assert.ok(!responseBody.includes('"stack"'));
});

test("CORS permits the configured client and rejects unrelated origins", async () => {
  const app = createApp();
  const allowed = await app.request("/healthz", {
    headers: { origin: "http://localhost:3000" },
  });
  assert.equal(
    allowed.headers.get("access-control-allow-origin"),
    "http://localhost:3000",
  );
  assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
  const denied = await app.request("/healthz", {
    headers: { origin: "https://untrusted.example" },
  });
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("limiting returns retry guidance and isolates clients", async () => {
  const app = new Hono();
  app.use("*", rateLimit({ windowMs: 60000, max: 2 }));
  app.get("/", (c) => c.text("ok"));
  const request = (ip: string) =>
    app.request("/", { headers: { "cf-connecting-ip": ip } });
  assert.equal((await request("192.0.2.1")).status, 200);
  assert.equal((await request("192.0.2.1")).status, 200);
  const blocked = await request("192.0.2.1");
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal((await request("192.0.2.2")).status, 200);
});

test("Cloudflare limiter binding denial is enforced", async () => {
  const app = new Hono();
  app.use(
    "*",
    rateLimit({
      windowMs: 60000,
      max: 2,
      getBinding: () => ({ limit: async () => ({ success: false }) }),
    }),
  );
  app.get("/", (c) => c.text("must not execute"));
  const result = await app.request("/");
  assert.equal(result.status, 429);
  assert.equal(result.headers.get("retry-after"), "60");
});

test("/live only upgrades for our origin with a valid session", async () => {
  const { authorizeLive } = await import("./app.js");
  const req = (headers: Record<string, string>) =>
    new Request("http://localhost:4000/live?workspaceId=w", { headers });
  const plain = await authorizeLive(req({ origin: "http://localhost:3000" }));
  assert.ok(plain instanceof Response && plain.status === 426);
  const foreign = await authorizeLive(req({ upgrade: "websocket", origin: "https://evil.example" }));
  assert.ok(foreign instanceof Response && foreign.status === 403);
  const anonymous = await authorizeLive(req({ upgrade: "websocket", origin: "http://localhost:3000" }));
  assert.ok(anonymous instanceof Response && anonymous.status === 401);
});
