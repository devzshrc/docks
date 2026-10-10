import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { db, schema, closeDb } from "@docks/db";
import { eq, ilike, sql } from "drizzle-orm";
import { recordWebhookDelivery } from "./observe.js";
import { appRouter } from "./routers/_app.js";

test(
  "webhook_delivery metadata, caps, and admin.webhooks",
  { skip: !process.env.DOCKS_TEST_DATABASE_URL },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
    assert.match(
      process.env.DATABASE_URL!,
      /test/,
      "Use a disposable test database",
    );
    const prefix = randomUUID();
    const run = `dlv-${prefix}`;
    const people = ["owner", "member"].map((role) => ({
      id: `${prefix}-${role}`,
      name: role,
      email: `${prefix}-${role}@example.test`,
      emailVerified: true,
      image: null,
      twoFactorEnabled: true,
    }));
    process.env.ADMIN_EMAILS = people[0]!.email;
    const caller = (i: number) =>
      appRouter.createCaller({ user: people[i]!, requestId: prefix });
    const owner = caller(0);
    const member = caller(1);
    const tag = (suffix: string) => `${run}-${suffix}`;
    try {
      await db.insert(schema.user).values(people);

      await t.test(
        "one metadata row per webhook; payloads are never stored",
        async () => {
          await recordWebhookDelivery({
            deliveryId: tag("ok"),
            installationId: 424242,
            event: "pull_request",
            result: "ok",
            durationMs: 42,
          });
          await recordWebhookDelivery({
            deliveryId: tag("failed"),
            installationId: 424242,
            event: "push",
            result: "failed",
            reason: new Error("handler exploded"),
            durationMs: 7,
          });
          await recordWebhookDelivery({
            deliveryId: tag("reject"),
            installationId: null,
            event: "issues",
            result: "signature_rejected",
            reason: "Invalid signature",
          });
          const rows = await db
            .select()
            .from(schema.webhookDelivery)
            .where(ilike(schema.webhookDelivery.deliveryId, `${run}%`));
          assert.equal(rows.length, 3);
          const [ok] = rows.filter((r) => r.deliveryId === tag("ok"));
          assert.equal(ok!.event, "pull_request");
          assert.equal(ok!.installationId, 424242);
          assert.equal(ok!.result, "ok");
          assert.equal(ok!.reason, null);
          assert.equal(ok!.durationMs, 42);
          assert.ok(ok!.receivedAt instanceof Date);
          const [failed] = rows.filter(
            (r) => r.deliveryId === tag("failed"),
          );
          assert.equal(failed!.result, "failed");
          assert.match(failed!.reason!, /handler exploded/);
          const [reject] = rows.filter(
            (r) => r.deliveryId === tag("reject"),
          );
          assert.equal(reject!.result, "signature_rejected");
          assert.equal(reject!.installationId, null);
        },
      );

      await t.test(
        "the table has no payload-carrying columns",
        async () => {
          const cols = await db.execute<{
            column_name: string;
            data_type: string;
          }>(
            sql`select column_name, data_type from information_schema.columns where table_name = 'webhook_delivery'`,
          );
          const names = cols.rows.map((r) => r.column_name);
          for (const banned of ["payload", "body", "headers", "meta", "data", "props"]) {
            assert.ok(
              !names.includes(banned),
              `webhook_delivery must not have a ${banned} column`,
            );
          }
          assert.ok(!cols.rows.some((r) => r.data_type === "jsonb"));
        },
      );

      await t.test("hostile input is capped, never thrown", async () => {
        await recordWebhookDelivery({
          deliveryId: (tag("hostile-") + "y".repeat(5000)).slice(0, 5000),
          installationId: NaN,
          event: "",
          result: "ok",
          reason: "z".repeat(5000),
          durationMs: -5,
        });
        const rows = await db
          .select()
          .from(schema.webhookDelivery)
          .where(ilike(schema.webhookDelivery.deliveryId, `%${prefix}%`));
        const hostile = rows.find((r) => r.event === "unknown");
        assert.ok(hostile, "empty event names become 'unknown'");
        assert.ok(hostile!.deliveryId!.length <= 200);
        assert.ok(hostile!.reason!.length <= 1000);
        assert.equal(hostile!.installationId, null);
        assert.equal(hostile!.durationMs, 0);
        await recordWebhookDelivery(null as never);
        await recordWebhookDelivery(undefined as never);
      });

      await t.test(
        "admin.webhooks is admin-only with search, filters, and 25-row pages",
        async () => {
          await assert.rejects(
            appRouter
              .createCaller({ user: null, requestId: prefix })
              .admin.webhooks({}),
            /Not authenticated/,
          );
          await assert.rejects(member.admin.webhooks({}), /Not found/);
          const inst = 987654321;
          for (let i = 0; i < 30; i++) {
            await recordWebhookDelivery({
              deliveryId: tag(`page-${i}`),
              installationId: i === 0 ? inst : 424242,
              event: "push",
              result: i % 2 === 0 ? "ok" : "failed",
              reason: i % 2 === 0 ? null : "paging failure",
            });
          }
          const first = await owner.admin.webhooks({
            search: run,
            limit: 25,
          });
          assert.ok(first.total >= 33);
          assert.equal(first.rows.length, 25);
          assert.ok(
            first.rows.every((r) => r.deliveryId!.startsWith(run)),
          );
          const second = await owner.admin.webhooks({
            search: run,
            limit: 25,
            offset: 25,
          });
          assert.ok(second.rows.length >= 8);
          const byInstallation = await owner.admin.webhooks({
            search: String(inst),
          });
          assert.ok(byInstallation.total >= 1);
          assert.ok(
            byInstallation.rows.every((r) => r.installationId === inst),
          );
          const exact = await owner.admin.webhooks({ installationId: inst });
          assert.ok(
            exact.rows.every((r) => r.installationId === inst),
          );
          const failedOnly = await owner.admin.webhooks({
            search: run,
            result: "failed",
          });
          assert.ok(failedOnly.total >= 16);
          assert.ok(failedOnly.rows.every((r) => r.result === "failed"));
          const byDelivery = await owner.admin.webhooks({
            search: tag("page-1"),
          });
          assert.ok(byDelivery.total >= 1);
          assert.ok(
            byDelivery.rows.every((r) => r.deliveryId!.includes(tag("page-1"))),
          );
        },
      );

      await t.test(
        "last24h counts only recent deliveries for the failure rate",
        async () => {
          const before = await owner.admin.webhooks({ limit: 1 });
          const { total } = before.last24h;
          assert.ok(before.last24h.rate >= 0 && before.last24h.rate <= 1);
          assert.ok(before.last24h.failed <= total);
          await recordWebhookDelivery({
            deliveryId: tag("old"),
            installationId: null,
            event: "ping",
            result: "failed",
            reason: "stale",
            receivedAt: new Date(Date.now() - 25 * 3600000),
          });
          const after = await owner.admin.webhooks({ limit: 1 });
          assert.equal(after.last24h.total, total);
          const found = await owner.admin.webhooks({ search: tag("old") });
          assert.equal(found.total, 1);
        },
      );

      await t.test("a failed webhook shows its reason and delivery id", async () => {
        const found = await owner.admin.webhooks({ search: tag("failed") });
        const row = found.rows.find((r) => r.deliveryId === tag("failed"));
        assert.ok(row);
        assert.match(row!.reason!, /handler exploded/);
        assert.equal(row!.deliveryId, tag("failed"));
      });
    } finally {
      await db
        .delete(schema.webhookDelivery)
        .where(ilike(schema.webhookDelivery.deliveryId, `${run}%`));
      await db
        .delete(schema.webhookDelivery)
        .where(ilike(schema.webhookDelivery.deliveryId, `%${prefix}%`));
      for (const p of people)
        await db.delete(schema.user).where(eq(schema.user.id, p.id));
      await closeDb();
    }
  },
);
