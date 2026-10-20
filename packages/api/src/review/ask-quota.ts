import { db, schema } from "@docks/db";
import { and, eq, lt, sql } from "drizzle-orm";

/**
 * Ask quota. Answered questions count; failed ones don't, and a pending one
 * only counts while it could still finish. A separate cap on all attempts
 * keeps retry loops from hammering the provider.
 */
export const ASK_ANSWERS_PER_HOUR = 30;
export const ASK_ATTEMPTS_PER_HOUR = 60;
/** A pending question older than this is treated as dead (worker interrupted). */
export const ASK_PENDING_TIMEOUT_MINUTES = 5;

export type AskUsage = { answers: number; attempts: number };

/** Per-user usage over the last hour; run inside the per-user advisory lock. */
export function askUsageQuery(executor: Pick<typeof db, "select">, userId: string) {
  const q = schema.reviewQuestion;
  return executor
    .select({
      answers: sql<number>`count(*) filter (where ${q.status} = 'completed' or (${q.status} = 'pending' and ${q.createdAt} > now() - make_interval(mins => ${ASK_PENDING_TIMEOUT_MINUTES})))::int`,
      attempts: sql<number>`count(*)::int`,
    })
    .from(q)
    .where(and(eq(q.userId, userId), sql`${q.createdAt} > now() - interval '1 hour'`));
}

/** The message to show when over quota, or null when the question may go ahead. */
export function askQuotaError(usage: AskUsage | undefined): string | null {
  if ((usage?.answers ?? 0) >= ASK_ANSWERS_PER_HOUR)
    return `You have reached ${ASK_ANSWERS_PER_HOUR} answers this hour. Try again later.`;
  if ((usage?.attempts ?? 0) >= ASK_ATTEMPTS_PER_HOUR)
    return "Too many attempts this hour. Try again later.";
  return null;
}

/** Scheduler: fail questions stuck in pending so they stop holding quota and show a retry. */
export async function expireStaleQuestions(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ASK_PENDING_TIMEOUT_MINUTES * 60_000);
  const rows = await db
    .update(schema.reviewQuestion)
    .set({
      status: "failed",
      answer: "This question timed out. Ask again to retry.",
      updatedAt: now,
    })
    .where(and(eq(schema.reviewQuestion.status, "pending"), lt(schema.reviewQuestion.createdAt, cutoff)))
    .returning({ id: schema.reviewQuestion.id });
  return rows.length;
}
