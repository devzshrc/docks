import { db, schema } from "@docks/db";
import { eq } from "drizzle-orm";
export async function isSuspended(userId: string) {
  const [row] = await db
    .select({ at: schema.accountControl.suspendedAt })
    .from(schema.accountControl)
    .where(eq(schema.accountControl.userId, userId))
    .limit(1);
  return Boolean(row?.at);
}
