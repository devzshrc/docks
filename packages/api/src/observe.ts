import { createHash } from "node:crypto";
import { db, schema } from "@docks/db";
import {
  getTableName,
  sql,
  type InferInsertModel,
  type Table,
} from "drizzle-orm";

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
    console.error(`[observe] ${getTableName(table)} not recorded: ${(err as Error).message}`);
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
  const raw = error instanceof Error ? error.message : String(error);
  const trimmed = raw.trim();
  return (trimmed || "Unknown error").slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function errorStackOf(error: unknown): string | null {
  const stack =
    error instanceof Error && error.stack ? error.stack : String(error);
  const trimmed = stack.trim();
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
    const message = `${prefix}${errorMessageOf(error)}`.slice(
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
    console.error(`[observe] server_error not recorded: ${(err as Error).message}`);
  }
}
