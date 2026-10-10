import { db, schema } from "@docks/db";
import { sql } from "drizzle-orm";
import { logEvent } from "./logger.js";

/** One bounded batch per table per hour. Billing and audit history are deliberately retained. */
export async function purgeDiagnostics(): Promise<void> {
  for (const [table, column, days] of [
    [schema.serverError, schema.serverError.lastAt, 90],
    [schema.webhookDelivery, schema.webhookDelivery.receivedAt, 90],
    [schema.aiCall, schema.aiCall.at, 365],
  ] as const) {
    const result = await db.execute(sql`delete from ${table} where ctid in (
      select ctid from ${table} where ${column} < now() - ${days} * interval '1 day' limit 1000
    )`);
    logEvent("info", "telemetry.retention", {
      days,
      deleted: result.rowCount ?? 0,
    });
  }
}
