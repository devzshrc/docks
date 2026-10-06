import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { auth } from "@docks/api";
import { appRouter } from "@docks/api";
import type { Context } from "@docks/api";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import cors from "cors";
import dotenv from "dotenv";
import express, { type Express } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { randomUUID } from "node:crypto";
import { githubCallbackRouter } from "./integrations/github-callback.js";
import { rateLimit } from "./rate-limit.js";
import { slackCallbackRouter } from "./integrations/slack-callback.js";
import { startWorker } from "./jobs/worker.js";
import { githubWebhookRouter } from "./webhooks/github.js";
import { billingWebhookRouter } from "./webhooks/billing.js";

dotenv.config();

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:3000";
const EXTRA_ORIGINS = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Session resolution via Better Auth.
 * Cookie (browser) or Authorization header flows into auth.api.getSession;
 * missing/invalid session -> anonymous (public procedures only,
 * protected ones return UNAUTHORIZED via isAuthed).
 */
async function createContext({
  req,
}: CreateExpressContextOptions): Promise<Context> {
  const requestId = (req.headers["x-request-id"] as string) ?? randomUUID();
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (session?.user) {
      const { id, name, email, emailVerified, image } = session.user;
      return { requestId, user: { id, name, email, emailVerified, image } };
    }
  } catch (err) {
    console.error(`[auth] getSession failed: ${(err as Error).message}`);
  }
  return { requestId, user: null };
}

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: [CLIENT_URL, "http://localhost:3000", ...EXTRA_ORIGINS],
      credentials: true,
    })
  );
  app.use(morgan("combined"));

  // Better Auth handler — must run before express.json() (it reads the raw body).
  app.all("/api/auth/*", toNodeHandler(auth));

  // GitHub webhooks need the raw body for signature checks — before express.json().
  app.use(githubWebhookRouter);
  app.use(billingWebhookRouter);

  app.use(express.json({ limit: "1mb" }));

  app.use(githubCallbackRouter);
  app.use(slackCallbackRouter);

  // K8s / load-balancer liveness probe (no tRPC).
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok", time: new Date().toISOString() });
  });

  app.use(
    "/trpc",
    // Board polling plus page loads stay well under this; scripts and abuse don't.
    rateLimit({ windowMs: 60_000, max: 300 }),
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path }) {
        // Don't leak internals — log server-side only.
        console.error(`[trpc] ${path} :: ${error.code}: ${error.message}`);
      },
    })
  );

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[server] tRPC listening on http://localhost:${PORT}/trpc`);
    console.log(`[server] auth  listening on http://localhost:${PORT}/api/auth`);
    console.log(`[server] healthz      on http://localhost:${PORT}/healthz`);
  });
  startWorker();
  console.log("[server] job worker started");
}
