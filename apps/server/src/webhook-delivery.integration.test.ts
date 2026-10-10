import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { test } from "node:test";
import { db, schema, closeDb, eq, inArray } from "@docks/db";
import { createApp } from "./app.js";

/** Wait for the fire-and-forget delivery row; recording never blocks the response. */
async function waitForDelivery(deliveryId: string, timeoutMs = 8000) {
  const start = Date.now();
  for (;;) {
    const rows = await db
      .select()
      .from(schema.webhookDelivery)
      .where(eq(schema.webhookDelivery.deliveryId, deliveryId));
    if (rows.length) return rows[0]!;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for delivery ${deliveryId}`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

test(
  "github ingress records every delivery without breaking responses",
  { skip: !process.env.DOCKS_TEST_DATABASE_URL },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
    assert.match(
      process.env.DATABASE_URL!,
      /test/,
      "Use a disposable test database",
    );
    const prefix = randomUUID();
    const run = `ingress-${prefix}`;
    const previousSecret = process.env.GITHUB_WEBHOOK_SECRET;
    process.env.GITHUB_WEBHOOK_SECRET = `test-secret-${prefix}`;
    const sign = (body: Buffer) =>
      `sha256=${createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!).update(body).digest("hex")}`;
    const app = createApp();
    const post = (
      body: Buffer | string,
      headers: Record<string, string>,
    ) =>
      app.request("/webhooks/github", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: typeof body === "string" ? body : new Uint8Array(body),
      });
    // A payload canary: if any payload bytes were stored, the row would contain it.
    const canary = `canary-${prefix}-payload-secret`;
    try {
      await t.test("signature rejects are recorded, response stays 401", async () => {
        const deliveryId = `${run}-reject`;
        const body = Buffer.from(
          JSON.stringify({
            installation: { id: 424242 },
            repository: { id: 1 },
            pull_request: { title: canary },
          }),
        );
        const res = await post(body, {
          "x-hub-signature-256": "sha256=wrong",
          "x-github-event": "push",
          "x-github-delivery": deliveryId,
        });
        assert.equal(res.status, 401);
        const row = await waitForDelivery(deliveryId);
        assert.equal(row.result, "signature_rejected");
        assert.equal(row.event, "push");
        assert.equal(row.installationId, 424242);
        assert.match(row.reason!, /Invalid signature/);
        assert.ok(!JSON.stringify(row).includes(canary));
      });

      await t.test("handled webhooks are recorded ok with metadata only", async () => {
        const deliveryId = `${run}-ok`;
        const body = Buffer.from(
          JSON.stringify({
            // Unknown repo: the handler returns early, so this has no side effects.
            installation: { id: 424243 },
            repository: { id: 2147483647 },
            pull_request: { title: canary },
          }),
        );
        const res = await post(body, {
          "x-hub-signature-256": sign(body),
          "x-github-event": "ping",
          "x-github-delivery": deliveryId,
        });
        assert.equal(res.status, 202);
        const row = await waitForDelivery(deliveryId);
        assert.equal(row.result, "ok");
        assert.equal(row.event, "ping");
        assert.equal(row.installationId, 424243);
        assert.equal(row.reason, null);
        assert.ok(row.durationMs >= 0);
        assert.ok(!JSON.stringify(row).includes(canary));
      });

      await t.test("handler failures are recorded failed, response stays 500", async () => {
        const deliveryId = `${run}-bad`;
        // Valid signature over invalid JSON: parsing throws inside the handler.
        const body = Buffer.from("not-json{{{");
        const res = await post(body, {
          "x-hub-signature-256": sign(body),
          "x-github-event": "push",
          "x-github-delivery": deliveryId,
        });
        assert.equal(res.status, 500);
        const row = await waitForDelivery(deliveryId);
        assert.equal(row.result, "failed");
        assert.ok((row.reason ?? "").length > 0);
      });
    } finally {
      if (previousSecret === undefined) delete process.env.GITHUB_WEBHOOK_SECRET;
      else process.env.GITHUB_WEBHOOK_SECRET = previousSecret;
      await db
        .delete(schema.webhookDelivery)
        .where(
          inArray(schema.webhookDelivery.deliveryId, [
            `${run}-reject`,
            `${run}-ok`,
            `${run}-bad`,
          ]),
        );
      await closeDb();
    }
  },
);
