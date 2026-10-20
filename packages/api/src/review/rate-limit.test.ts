import assert from "node:assert/strict";
import { test } from "node:test";
import { installationClient, installationRateLimit, isLow, rateLimitForToken } from "./github.js";

test("GitHub rate-limit headers are recorded per token and flagged when low", async () => {
  const real = globalThis.fetch;
  let remaining = 4000;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const path = String(url);
    const headers = { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": String(remaining), "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 600) };
    if (path.includes("/access_tokens")) return Response.json({ token: "tok-rl", expires_at: new Date(Date.now() + 3_600_000).toISOString() }, { headers });
    return Response.json({ content: Buffer.from("x").toString("base64"), encoding: "base64" }, { headers });
  }) as typeof fetch;
  process.env.GITHUB_APP_ID = "1";
  process.env.GITHUB_APP_PRIVATE_KEY = (await import("node:crypto")).generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  try {
    const gh = installationClient(77);
    await gh.fileContent("o/r", "a.txt");
    assert.equal(isLow(await installationRateLimit(77)), false);
    remaining = 120;
    await gh.fileContent("o/r", "b.txt");
    const reading = await rateLimitForToken("tok-rl");
    assert.equal(reading?.remaining, 120);
    assert.equal(isLow(reading), true);
    assert.equal(isLow(null), false);
  } finally {
    globalThis.fetch = real;
  }
});
