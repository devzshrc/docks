import { bigint, index, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers.js";

/**
 * One row per received GitHub webhook (observability Phase 2).
 * Only metadata is stored: the event name, the GitHub delivery id
 * (`X-GitHub-Delivery`), the installation id when the payload carried one,
 * the outcome, and how long handling took. Full payloads are never stored
 * here — they can contain code, tokens, and PII.
 */
export const WEBHOOK_RESULTS = ["ok", "failed", "signature_rejected"] as const;
export type WebhookResult = (typeof WEBHOOK_RESULTS)[number];

export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    id: serial("id").primaryKey(),
    /** GitHub's `X-GitHub-Delivery` header; null when the header was missing. */
    deliveryId: text("delivery_id"),
    /** `payload.installation.id` when present; null for rejects/unknown installs. */
    installationId: bigint("installation_id", { mode: "number" }),
    /** GitHub event name (`X-GitHub-Event`), e.g. `pull_request`. */
    event: text("event").notNull(),
    result: text("result", { enum: WEBHOOK_RESULTS }).notNull(),
    /** Failure reason (handler error or reject cause); null for `ok`. */
    reason: text("reason"),
    durationMs: integer("duration_ms").notNull().default(0),
    receivedAt: timestamptz("received_at").defaultNow().notNull(),
  },
  (t) => [
    index("webhook_delivery_received_at_idx").on(t.receivedAt),
    index("webhook_delivery_installation_idx").on(t.installationId),
    index("webhook_delivery_result_idx").on(t.result),
  ],
);
