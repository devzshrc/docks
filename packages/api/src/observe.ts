import { createHash } from "node:crypto";
import { db, schema } from "@docks/db";
import {
  getTableName,
  sql,
  type InferInsertModel,
  type Table,
} from "drizzle-orm";

import { redactDiagnostic } from "./diagnostics.js";
export { redactDiagnostic } from "./diagnostics.js";

function logFailure(table: string): void {
  // Database errors may embed rejected values, SQL parameters, or credentials.
  console.error(`[observe] ${table} not recorded`);
}

/**
 * Best-effort observability writer (observability Phase 0).
 * Same contract as `audit` in access.ts and `track` in analytics.ts:
 * inserts one row into the given table, logs failures, never throws.
 */
export async function write_event<T extends Table>(
  table: T,
  values: InferInsertModel<T>,
): Promise<void> {
  try {
    await db.insert(table).values(values);
  } catch (err) {
    logFailure(getTableName(table));
  }
}

/** Stored-message cap so one pathological error cannot bloat the row. */
export const MAX_ERROR_MESSAGE_LENGTH = 1000;
/** Stored-stack cap; full stacks live only in this table, never in responses. */
export const MAX_ERROR_STACK_LENGTH = 8000;

/**
 * Normalize an error message so repeat instances of the same bug share a
 * hash: uuids, hex literals and numbers become `#`, whitespace collapses.
 */
export function normalizeErrorMessage(message: string): string {
  return message
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "#",
    )
    .replace(/0x[0-9a-f]+/gi, "#")
    .replace(/\b[0-9a-f]{7,}\b/gi, "#")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

/** sha256 of the normalized message — the `server_error` grouping key. */
export function errorHash(message: string): string {
  return createHash("sha256")
    .update(normalizeErrorMessage(message))
    .digest("hex");
}

function errorMessageOf(error: unknown): string {
  const raw = redactDiagnostic(error instanceof Error ? error.message : String(error));
  const trimmed = raw.trim();
  return (trimmed || "Unknown error").slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function errorStackOf(error: unknown): string | null {
  const stack =
    error instanceof Error && error.stack ? error.stack : String(error);
  const trimmed = redactDiagnostic(stack).trim();
  return (trimmed || null)?.slice(0, MAX_ERROR_STACK_LENGTH) ?? null;
}

/**
 * Grouped server-error recorder (observability Phase 1).
 * Upserts one `server_error` row per normalized message: `total` increments
 * and `last_at` advances, `stack` keeps the most recent full stack.
 * `prefix` lets callers attach route/job context to the grouped message
 * without touching the original error or its stack.
 * Best-effort: logs failures, never throws, never blocks the caller.
 */
export async function recordServerError(
  error: unknown,
  prefix = "",
): Promise<void> {
  try {
    const message = redactDiagnostic(`${prefix}${errorMessageOf(error)}`).slice(
      0,
      MAX_ERROR_MESSAGE_LENGTH,
    );
    const stack = errorStackOf(error);
    const now = new Date();
    await db
      .insert(schema.serverError)
      .values({
        hash: errorHash(message),
        message,
        stack,
        total: 1,
        firstAt: now,
        lastAt: now,
      })
      .onConflictDoUpdate({
        target: schema.serverError.hash,
        set: {
          message,
          stack,
          total: sql`${schema.serverError.total} + 1`,
          lastAt: now,
        },
      });
  } catch (err) {
    logFailure("server_error");
  }
}

/** Stored webhook event-name cap; GitHub event names are short. */
export const MAX_WEBHOOK_EVENT_LENGTH = 100;
/** Stored webhook reason cap so a pathological error cannot bloat the row. */
export const MAX_WEBHOOK_REASON_LENGTH = 1000;
/** Stored delivery-id cap; GitHub sends a UUID. */
export const MAX_WEBHOOK_DELIVERY_ID_LENGTH = 200;

export type WebhookDeliveryResult = (typeof schema.WEBHOOK_RESULTS)[number];

function webhookText(value: string | null | undefined, max: number): string | null {
  const trimmed = redactDiagnostic(value ?? "").trim();
  return (trimmed || null)?.slice(0, max) ?? null;
}

/**
 * Webhook-delivery recorder (observability Phase 2).
 * Inserts one `webhook_delivery` metadata row per received webhook:
 * event name, GitHub delivery id, installation id when known, outcome,
 * and handling time. Full payloads are never stored — callers pass only
 * the delivery id and the installation id extracted from the payload.
 * Best-effort: logs failures, never throws, never blocks the caller.
 */
export async function recordWebhookDelivery(input: {
  deliveryId?: string | null;
  installationId?: number | null;
  event: string;
  result: WebhookDeliveryResult;
  reason?: unknown;
  durationMs?: number;
  receivedAt?: Date;
}): Promise<void> {
  try {
    const reasonRaw =
      input.reason instanceof Error
        ? input.reason.message
        : typeof input.reason === "string"
          ? input.reason
          : input.reason == null
            ? null
            : String(input.reason);
    await write_event(schema.webhookDelivery, {
      deliveryId: webhookText(input.deliveryId, MAX_WEBHOOK_DELIVERY_ID_LENGTH),
      installationId:
        typeof input.installationId === "number" &&
        Number.isSafeInteger(input.installationId) && input.installationId > 0
          ? input.installationId
          : null,
      event:
        webhookText(input.event, MAX_WEBHOOK_EVENT_LENGTH) ?? "unknown",
      result: input.result,
      reason: reasonRaw
        ? redactDiagnostic(reasonRaw).trim().slice(0, MAX_WEBHOOK_REASON_LENGTH) || null
        : null,
      durationMs: Number.isFinite(input.durationMs)
        ? Math.min(2147483647, Math.max(0, Math.floor(input.durationMs!)))
        : 0,
      receivedAt: input.receivedAt instanceof Date && Number.isFinite(input.receivedAt.getTime())
        ? input.receivedAt : new Date(),
    });
  } catch (err) {
    logFailure("webhook_delivery");
  }
}
