import { db, aiCall, billingEvent } from "@docks/db";
import { logEvent } from "./logger.js";
import { desc, gte, sql } from "drizzle-orm";
import { redactDiagnostic, write_event } from "./observe.js";

export interface AiContext { workspaceId?: string; repoId?: number }
export type AiOutcome = typeof aiCall.$inferInsert.outcome;
export function tokenCount(value: number | undefined): number | null {
  return Number.isSafeInteger(value) && value! >= 0 && value! <= 2147483647 ? value! : null;
}
export async function recordAiCall(input: AiContext & {
  operation: "guide" | "ask"; model: string; outcome: AiOutcome;
  inputTokens?: number; outputTokens?: number; latencyMs: number;
}): Promise<void> {
  logEvent(input.outcome === "failed" ? "error" : "info", "ai.completed", {
    operation: input.operation, model: input.model, outcome: input.outcome, durationMs: input.latencyMs,
    inputTokens: tokenCount(input.inputTokens), outputTokens: tokenCount(input.outputTokens),
  });
  await write_event(aiCall, {
    ...input, model: redactDiagnostic(input.model).slice(0, 100),
    inputTokens: tokenCount(input.inputTokens), outputTokens: tokenCount(input.outputTokens),
    latencyMs: Math.max(0, Math.min(2147483647, Math.floor(input.latencyMs))),
    cached: input.outcome === "cached",
  });
}
/** Admin callers must enforce permission before accessing these metadata aggregates. */
export async function aiTelemetrySummary(since: Date) {
  return db.select({ operation: aiCall.operation, outcome: aiCall.outcome, model: aiCall.model,
    calls: sql<number>`count(*)::int`, inputTokens: sql<number>`coalesce(sum(${aiCall.inputTokens}), 0)::float8`,
    outputTokens: sql<number>`coalesce(sum(${aiCall.outputTokens}), 0)::float8`,
    averageLatencyMs: sql<number>`avg(${aiCall.latencyMs})::float8`,
    unknownUsageCalls: sql<number>`count(*) filter (where ${aiCall.inputTokens} is null or ${aiCall.outputTokens} is null)::int`,
  }).from(aiCall).where(gte(aiCall.at, since)).groupBy(aiCall.operation, aiCall.outcome, aiCall.model);
}
export async function recentBillingEvents(limit = 50) {
  return db.select().from(billingEvent).orderBy(desc(billingEvent.at)).limit(Math.min(100, Math.max(1, limit)));
}
