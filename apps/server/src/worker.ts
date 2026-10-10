/// <reference types="@cloudflare/workers-types" />
import {
  useKv,
  currentRequestId,
  logEvent,
  operationalHealth,
  logError,
  withLogContext,
  withTraceRunner,
  type KvLike,
} from "@docks/api";
import { withDb } from "@docks/db";
import { createApp } from "./app.js";
import { checkReadiness } from "./readiness.js";
import { sendHeartbeat } from "./heartbeat.js";
import { drainQueue, runSchedules } from "./jobs/worker.js";
import type { RateLimitBinding } from "./rate-limit.js";

interface Env {
  HYPERDRIVE: Hyperdrive;
  CACHE?: KvLike;
  TRPC_LIMITER?: RateLimitBinding;
  [key: string]: unknown;
}

function traceRunner(ctx: ExecutionContext) {
  return (name: string, task: () => Promise<unknown>) =>
    ctx.tracing.enterSpan(name, async (span) => {
      const requestId = currentRequestId();
      if (requestId) span.setAttribute("request.id", requestId);
      try {
        const result = await task();
        if (
          result &&
          typeof result === "object" &&
          "ok" in result &&
          result.ok === false
        )
          span.setStatus({ code: "error" });
        return result;
      } catch (error) {
        span.setStatus({ code: "error" });
        span.recordException({
          name: error instanceof Error ? error.name : "UnknownError",
        });
        throw error;
      }
    });
}

/** Cloudflare Workers entry: HTTP via Hono, background jobs via a per-minute cron. */
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    useKv(env.CACHE);
    // Webhooks enqueue jobs; start draining right away instead of waiting for the next cron tick.
    const drain = () =>
      ctx.waitUntil(
        withDb(env.HYPERDRIVE.connectionString, () => drainQueue(10_000)),
      );
    return withTraceRunner(traceRunner(ctx), () =>
      withLogContext({ release: String(env.RELEASE_SHA ?? "unknown") }, () =>
        withDb(env.HYPERDRIVE.connectionString, async () =>
          createApp({
            readiness: () => checkReadiness(env.HYPERDRIVE.connectionString),
            afterWebhook: drain,
            observe: (task) =>
              ctx.waitUntil(withDb(env.HYPERDRIVE.connectionString, task)),
          }).fetch(request, env, ctx),
        ),
      ),
    );
  },

  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    useKv(env.CACHE);
    ctx.waitUntil(
      withTraceRunner(traceRunner(ctx), () =>
        withDb(env.HYPERDRIVE.connectionString, async () => {
          await withLogContext(
            { release: String(env.RELEASE_SHA ?? "unknown") },
            async () => {
              try {
                const healthy = await runSchedules();
                await drainQueue(25_000);
                const snapshot = await operationalHealth();
                const oldestReadyAgeMs = snapshot.queue.oldestReadyAt
                  ? Math.max(
                      0,
                      Date.now() -
                        new Date(snapshot.queue.oldestReadyAt).getTime(),
                    )
                  : null;
                logEvent("info", "health.snapshot", {
                  readyJobs: snapshot.queue.ready,
                  oldestReadyAgeMs,
                  staleRunning: snapshot.queue.staleRunning,
                  aiCalls: snapshot.ai.calls,
                  aiFailures: snapshot.ai.failures,
                  aiP95Ms: snapshot.ai.p95Ms,
                  webhookCalls: snapshot.webhooks.calls,
                  webhookFailures: snapshot.webhooks.failures,
                  windowMs: 300000,
                });
                if (healthy)
                  await sendHeartbeat(
                    typeof env.MONITOR_HEARTBEAT_URL === "string"
                      ? env.MONITOR_HEARTBEAT_URL
                      : undefined,
                  );
              } catch (error) {
                logError("cron.failed", error);
                throw error;
              }
            },
          );
        }),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
