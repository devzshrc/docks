import { bigint, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers.js";

/** Verified provider receipts; no webhook payload, customer email, or payment details. */
export const billingEvent = pgTable("billing_event", {
  id: uuid("id").defaultRandom().primaryKey(),
  at: timestamptz("at").defaultNow().notNull(),
  /** Standard Webhooks id, the atomic idempotency key. */
  deliveryId: text("delivery_id").notNull(),
  workspaceId: text("workspace_id"),
  kind: text("kind").notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }),
  currency: text("currency"),
  subscriptionId: text("subscription_id"),
  outcome: text("outcome").$type<"applied" | "unmatched" | "ignored">().notNull(),
}, (t) => [uniqueIndex("billing_event_delivery_unique").on(t.deliveryId), index("billing_event_at_idx").on(t.at)]);
