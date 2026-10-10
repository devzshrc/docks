import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { db, schema, closeDb, eq } from "@docks/db";
import { recordWebhookDelivery, recordServerError, errorHash } from "./observe.js";

test("persistent diagnostics redact secrets and bound hostile numeric metadata", { skip: !process.env.DOCKS_TEST_DATABASE_URL }, async () => {
  assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
  assert.match(process.env.DATABASE_URL!, /test/);
  const id = randomUUID();
  const text = `safety ${id} token=secretcanary person@example.test`;
  const hash = errorHash(text.replace("secretcanary", "[redacted]").replace("person@example.test", "[email redacted]"));
  try {
    await recordServerError(new Error(text));
    const [error] = await db.select().from(schema.serverError).where(eq(schema.serverError.hash, hash));
    assert.ok(error);
    assert.ok(!JSON.stringify(error).includes("secretcanary"));
    assert.ok(!JSON.stringify(error).includes("person@example.test"));
    await recordWebhookDelivery({ deliveryId: id, event: "push", result: "failed", reason: text, durationMs: Infinity, installationId: Number.MAX_SAFE_INTEGER + 1, receivedAt: new Date(NaN) });
    const [delivery] = await db.select().from(schema.webhookDelivery).where(eq(schema.webhookDelivery.deliveryId, id));
    assert.ok(delivery);
    assert.equal(delivery.durationMs, 0);
    assert.equal(delivery.installationId, null);
    assert.ok(Number.isFinite(delivery.receivedAt.getTime()));
    assert.ok(!delivery.reason!.includes("secretcanary"));
  } finally {
    await db.delete(schema.serverError).where(eq(schema.serverError.hash, hash));
    await db.delete(schema.webhookDelivery).where(eq(schema.webhookDelivery.deliveryId, id));
    await closeDb();
  }
});
