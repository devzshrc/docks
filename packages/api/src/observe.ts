import { db } from "@docks/db";
import { getTableName, type InferInsertModel, type Table } from "drizzle-orm";

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
