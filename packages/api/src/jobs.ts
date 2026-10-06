import { db, schema } from "@docks/db";
import { and, eq, sql } from "drizzle-orm";

/** plan.md §7 — row-level job queue. The worker loop lives in apps/server. */

export type JobType = (typeof schema.jobs.$inferSelect)["type"];
export type Job = typeof schema.jobs.$inferSelect;

export const MAX_ATTEMPTS = 5;

/** Thrown by handlers when retrying can't help (bad credentials, invalid input). */
export class PermanentJobError extends Error {}

/** Enqueue unless an identical job is already queued (webhooks fire in bursts). */
export async function enqueue(type: JobType, payload: Record<string, unknown>) {
  const json = JSON.stringify(payload);
  const [existing] = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.type, type),
        eq(schema.jobs.status, "queued"),
        sql`${schema.jobs.payload} = ${json}::jsonb`,
      ),
    )
    .limit(1);
  if (existing) return;
  await db.insert(schema.jobs).values({ type, payload });
}

/** Claim the next ready job; SKIP LOCKED lets several workers run safely. */
export async function claimNextJob(): Promise<Job | null> {
  const result = await db.execute<{ id: number }>(sql`
    UPDATE ${schema.jobs}
    SET status = 'running', attempts = attempts + 1, updated_at = now()
    WHERE id = (
      SELECT id FROM ${schema.jobs}
      WHERE status = 'queued' AND run_after <= now()
      ORDER BY run_after
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);
  const id = result.rows[0]?.id;
  if (id === undefined) return null;
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return job ?? null;
}

export async function completeJob(id: number) {
  await db.update(schema.jobs).set({ status: "done" }).where(eq(schema.jobs.id, id));
}

/** Exponential backoff: 30s, 1m, 2m, 4m, then give up. */
export async function failJob(job: Job, error: unknown) {
  const giveUp = job.attempts >= MAX_ATTEMPTS || error instanceof PermanentJobError;
  await db
    .update(schema.jobs)
    .set({
      status: giveUp ? "failed" : "queued",
      lastError: error instanceof Error ? error.message : String(error),
      runAfter: new Date(Date.now() + 30_000 * 2 ** (job.attempts - 1)),
    })
    .where(eq(schema.jobs.id, job.id));
}
