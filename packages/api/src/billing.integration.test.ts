import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { closeDb, db, schema } from "@docks/db";
import { eq } from "drizzle-orm";
import { handleBillingWebhook } from "./billing.js";
import { assertCanAddMember, assertCanEnableRepo, assertTeam, workspacePlan } from "./plans.js";

const secret = randomBytes(24);
process.env.DODO_PAYMENTS_API_KEY ??= "test-key";
process.env.DODO_PAYMENTS_WEBHOOK_KEY = `whsec_${secret.toString("base64")}`;

/** A Standard Webhooks delivery, signed like Dodo signs it. */
function delivery(type: string, data: Record<string, unknown>, id = `msg_${randomUUID()}`, key = secret) {
  const body = JSON.stringify({ business_id: "biz", type, timestamp: new Date().toISOString(), data });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return {
    body: Buffer.from(body),
    headers: { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` },
  };
}

const subscription = (workspaceId: string | null, status: string, customer = "cus_1") => ({
  subscription_id: `sub_${customer}`,
  status,
  next_billing_date: "2026-11-20T00:00:00Z",
  metadata: workspaceId ? { workspaceId } : {},
  customer: { customer_id: customer },
  product_id: "prod",
  quantity: 1,
});

test("billing webhooks and plan limits", { skip: !process.env.DOCKS_TEST_DATABASE_URL }, async (t) => {
  assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
  const id = randomUUID();
  const customer = `cus_${id.slice(0, 8)}`;
  const installation = Date.now() % 1_000_000_000;
  t.after(async () => {
    await db.delete(schema.billingEvent).where(eq(schema.billingEvent.subscriptionId, `sub_${customer}`));
    await db.delete(schema.workspace).where(eq(schema.workspace.id, id));
    await db.delete(schema.user).where(eq(schema.user.email, `${id}-0@example.test`));
    await closeDb();
  });
  await db.insert(schema.workspace).values({ id, name: "Billing", slug: id });
  const plan = async () => (await db.select().from(schema.workspace).where(eq(schema.workspace.id, id)))[0]!;

  await t.test("bad signatures are rejected and change nothing", async () => {
    const forged = delivery("subscription.active", subscription(id, "active", customer), undefined, randomBytes(24));
    assert.equal(await handleBillingWebhook(forged.body, forged.headers), false);
    assert.equal((await plan()).plan, "free");
  });

  await t.test("an active subscription upgrades the workspace once, even when redelivered", async () => {
    const d = delivery("subscription.active", subscription(id, "active", customer));
    assert.equal(await handleBillingWebhook(d.body, d.headers), true);
    assert.equal(await handleBillingWebhook(d.body, d.headers), true);
    const ws = await plan();
    assert.equal(ws.plan, "team");
    assert.equal(ws.billingCustomerId, customer);
    const events = await db.select().from(schema.billingEvent).where(eq(schema.billingEvent.deliveryId, d.headers["webhook-id"]));
    assert.equal(events.length, 1);
    assert.equal(events[0]!.outcome, "applied");
    assert.equal(events[0]!.workspaceId, id);
  });

  await t.test("a failed renewal keeps Team; cancellation downgrades (matched by customer without metadata)", async () => {
    const hold = delivery("subscription.on_hold", subscription(null, "on_hold", customer));
    await handleBillingWebhook(hold.body, hold.headers);
    assert.equal((await plan()).plan, "team");
    const cancelled = delivery("subscription.cancelled", subscription(null, "cancelled", customer));
    await handleBillingWebhook(cancelled.body, cancelled.headers);
    const ws = await plan();
    assert.equal(ws.plan, "free");
    assert.equal(ws.subscriptionStatus, "cancelled");
  });

  await t.test("a subscription for an unknown workspace is recorded as unmatched", async () => {
    const d = delivery("subscription.active", subscription(null, "active", `${customer}-other`));
    await handleBillingWebhook(d.body, d.headers);
    const [event] = await db.select().from(schema.billingEvent).where(eq(schema.billingEvent.deliveryId, d.headers["webhook-id"]));
    assert.equal(event!.outcome, "unmatched");
    await db.delete(schema.billingEvent).where(eq(schema.billingEvent.id, event!.id));
  });

  await t.test("free plan limits and Team-only features; a premium grant lifts them", async () => {
    await assert.rejects(assertTeam(id), /Team plan/);
    const users = Array.from({ length: 5 }, (_, i) => ({
      id: `${id}-${i}`,
      name: `U${i}`,
      email: `${id}-${i}@example.test`,
      emailVerified: true,
    }));
    await db.insert(schema.user).values(users);
    await db.insert(schema.workspaceMember).values(users.map((u) => ({ workspaceId: id, userId: u.id, role: "member" as const })));
    await assert.rejects(assertCanAddMember(id), /up to 5 people/);

    await db.insert(schema.githubInstallation).values({ id: installation, workspaceId: id, accountLogin: "o", accountType: "Organization" });
    await db.insert(schema.repository).values(
      [0, 1, 2].map((i) => ({ id: installation * 10 + i, installationId: installation, fullName: `o/${id}-${i}`, defaultBranch: "main" })),
    );
    await assert.rejects(assertCanEnableRepo(id), /up to 3 repositories/);

    await db.insert(schema.premiumGrant).values({ workspaceId: id, createdBy: users[0]!.id, reason: "test" });
    assert.equal(await workspacePlan(id), "team");
    await assertTeam(id);
    await assertCanAddMember(id);
    await assertCanEnableRepo(id);
    for (const u of users) await db.delete(schema.user).where(eq(schema.user.id, u.id));
  });
});
