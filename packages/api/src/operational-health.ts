import { db, schema } from "@docks/db";
import { desc, gte, sql } from "drizzle-orm";

/** Reused by cron telemetry and the authorized admin API; never exposes payloads. */
export async function operationalHealth() {
  const since = new Date(Date.now() - 5 * 60000);
  const [jobs, ai, webhooks, deployments] = await Promise.all([
    db
      .select({
        ready: sql<number>`count(*) filter (where ${schema.jobs.status} = 'queued' and ${schema.jobs.runAfter} <= now())::int`,
        oldestReadyAt: sql<
          string | null
        >`min(${schema.jobs.runAfter}) filter (where ${schema.jobs.status} = 'queued' and ${schema.jobs.runAfter} <= now())`,
        staleRunning: sql<number>`count(*) filter (where ${schema.jobs.status} = 'running' and ${schema.jobs.updatedAt} < now() - interval '10 minutes')::int`,
        lastCompletedAt: sql<
          string | null
        >`max(${schema.jobs.updatedAt}) filter (where ${schema.jobs.status} = 'done')`,
      })
      .from(schema.jobs),
    db
      .select({
        calls: sql<number>`count(*)::int`,
        failures: sql<number>`count(*) filter (where ${schema.aiCall.outcome} in ('failed', 'incomplete', 'unparseable'))::int`,
        p95Ms: sql<
          number | null
        >`percentile_cont(0.95) within group (order by ${schema.aiCall.latencyMs})`,
      })
      .from(schema.aiCall)
      .where(gte(schema.aiCall.at, since)),
    db
      .select({
        calls: sql<number>`count(*)::int`,
        failures: sql<number>`count(*) filter (where ${schema.webhookDelivery.result} = 'failed')::int`,
      })
      .from(schema.webhookDelivery)
      .where(gte(schema.webhookDelivery.receivedAt, since)),
    db
      .select()
      .from(schema.deployMark)
      .orderBy(desc(schema.deployMark.at))
      .limit(5),
  ]);
  return {
    queue: jobs[0]!,
    ai: ai[0]!,
    webhooks: webhooks[0]!,
    deployments,
    observedAt: new Date(),
  };
}
