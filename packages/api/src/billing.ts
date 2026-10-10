import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import DodoPayments from "dodopayments";
import { eq, or } from "drizzle-orm";
import { billingEvent } from "@docks/db";
import { memberCount } from "./plans.js";

/**
 * Dodo Payments billing — plan.md §9.2, §11. One subscription per workspace on a
 * per-seat product, quantity = member count. Dodo is the source of truth; the
 * webhook copies plan and status onto the workspace row.
 *
 * Env: DODO_PAYMENTS_API_KEY, DODO_PAYMENTS_WEBHOOK_KEY, DODO_PAYMENTS_PRODUCT_ID
 * (per-seat monthly subscription product), DODO_PAYMENTS_ENVIRONMENT
 * ("test_mode" | "live_mode", default test_mode), CLIENT_URL.
 */

let client: DodoPayments | null = null;

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Billing isn't configured on the server yet" });
  }
  return value;
}

function dodo(): DodoPayments {
  client ??= new DodoPayments({
    bearerToken: env("DODO_PAYMENTS_API_KEY"),
    webhookKey: env("DODO_PAYMENTS_WEBHOOK_KEY"),
    environment: process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode",
  });
  return client;
}

const clientUrl = () => process.env.CLIENT_URL ?? "http://localhost:3000";

/**
 * Statuses where the workspace keeps Team features. on_hold / past_due are a
 * failed renewal that Dodo is still retrying, so we don't downgrade yet.
 */
const PAID = new Set(["active", "on_hold", "past_due"]);

async function loadWorkspace(workspaceId: string) {
  const [ws] = await db
    .select()
    .from(schema.workspace)
    .where(eq(schema.workspace.id, workspaceId))
    .limit(1);
  if (!ws) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
  return ws;
}

export async function checkoutUrl(workspaceId: string, email: string, name: string): Promise<string> {
  const ws = await loadWorkspace(workspaceId);
  if (ws.plan === "team" && ws.billingSubscriptionId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This workspace is already on Team" });
  }
  // Create the customer up front so webhooks can be matched by customer id
  // even if checkout metadata doesn't reach the subscription.
  let customerId = ws.billingCustomerId;
  if (!customerId) {
    const customer = await dodo().customers.create({ email, name });
    customerId = customer.customer_id;
    await db
      .update(schema.workspace)
      .set({ billingCustomerId: customerId })
      .where(eq(schema.workspace.id, workspaceId));
  }
  const session = await dodo().checkoutSessions.create({
    product_cart: [
      { product_id: env("DODO_PAYMENTS_PRODUCT_ID"), quantity: Math.max(1, await memberCount(workspaceId)) },
    ],
    customer: { customer_id: customerId },
    metadata: { workspaceId },
    return_url: `${clientUrl()}/settings/billing?checkout=success`,
  });
  if (!session.checkout_url) throw new Error("Dodo Payments returned no checkout URL");
  return session.checkout_url;
}

export async function portalUrl(workspaceId: string): Promise<string> {
  const ws = await loadWorkspace(workspaceId);
  if (!ws.billingCustomerId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No billing account yet. Upgrade first." });
  }
  const session = await dodo().customers.customerPortal.create(ws.billingCustomerId);
  return session.link;
}

/** Keep the seat quantity equal to the member count, prorated. */
export async function syncSeats(workspaceId: string) {
  const ws = await loadWorkspace(workspaceId);
  if (!ws.billingSubscriptionId || ws.plan !== "team") return;
  const sub = await dodo().subscriptions.retrieve(ws.billingSubscriptionId);
  const seats = Math.max(1, await memberCount(workspaceId));
  if (sub.quantity !== seats) {
    await dodo().subscriptions.changePlan(ws.billingSubscriptionId, {
      product_id: sub.product_id,
      quantity: seats,
      proration_billing_mode: "prorated_immediately",
    });
  }
}

interface SubscriptionData {
  subscription_id: string;
  status: string;
  next_billing_date: string;
  metadata: Record<string, string>;
  customer: { customer_id: string };
}

type BillingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function applySubscription(sub: SubscriptionData, tx: BillingTransaction) {
  const byMetadata = sub.metadata?.workspaceId;
  const match = byMetadata
    ? eq(schema.workspace.id, byMetadata)
    : or(
        eq(schema.workspace.billingCustomerId, sub.customer.customer_id),
        eq(schema.workspace.billingSubscriptionId, sub.subscription_id),
      );
  return tx
    .update(schema.workspace)
    .set({
      plan: PAID.has(sub.status) ? "team" : "free",
      billingSubscriptionId: sub.subscription_id,
      billingCustomerId: sub.customer.customer_id,
      subscriptionStatus: sub.status,
      currentPeriodEnd: sub.next_billing_date ? new Date(sub.next_billing_date) : null,
    })
    .where(match!)
    .returning({ id: schema.workspace.id });
}

/**
 * Verify (Standard Webhooks signature) and apply a Dodo Payments webhook.
 * Returns false when the signature is bad.
 */
export async function handleBillingWebhook(rawBody: Buffer, headers: Record<string, string>) {
  let event: ReturnType<DodoPayments["webhooks"]["unwrap"]>;
  try {
    event = dodo().webhooks.unwrap(rawBody.toString("utf8"), { headers });
  } catch {
    return false;
  }
  if (event.type.startsWith("subscription.")) {
    const deliveryId = headers["webhook-id"];
    // Signature verification requires this id. Never deduplicate by unsigned payload fields.
    if (!deliveryId) return false;
    await db.transaction(async (tx) => {
      const sub = event.data as unknown as SubscriptionData;
      const claimed = await tx.insert(billingEvent).values({
        deliveryId, kind: event.type, subscriptionId: sub.subscription_id,
        outcome: "unmatched",
      }).onConflictDoNothing({ target: billingEvent.deliveryId }).returning({ id: billingEvent.id });
      if (!claimed.length) return;
      const changed = await applySubscription(sub, tx);
      await tx.update(billingEvent).set({
        workspaceId: changed[0]?.id ?? null, outcome: changed.length ? "applied" : "unmatched",
      }).where(eq(billingEvent.id, claimed[0]!.id));
    });
  }
  return true;
}
