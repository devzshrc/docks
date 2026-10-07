/// <reference types="@cloudflare/workers-types" />
import { useKv, type KvLike } from "@docks/api";
import { withDb } from "@docks/db";
import { createApp } from "./app.js";
import { drainQueue, runSchedules } from "./jobs/worker.js";
import type { RateLimitBinding } from "./rate-limit.js";

interface Env {
  HYPERDRIVE: Hyperdrive;
  CACHE?: KvLike;
  TRPC_LIMITER?: RateLimitBinding;
  [key: string]: unknown;
}

/** Cloudflare Workers entry: HTTP via Hono, background jobs via a per-minute cron. */
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    useKv(env.CACHE);
    // Webhooks enqueue jobs; start draining right away instead of waiting for the next cron tick.
    const drain = () => ctx.waitUntil(withDb(env.HYPERDRIVE.connectionString, () => drainQueue(10_000)));
    return withDb(env.HYPERDRIVE.connectionString, async () => createApp({ afterWebhook: drain }).fetch(request, env, ctx));
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    useKv(env.CACHE);
    ctx.waitUntil(
      withDb(env.HYPERDRIVE.connectionString, async () => {
        await runSchedules();
        await drainQueue(25_000);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
