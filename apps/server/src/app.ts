import { appRouter, auth, completeAuthorization, connectSlack, handleBillingWebhook, handleGithubEvent, linkInstallation, verifyGithubSignature } from "@docks/api";
import type { Context as TrpcContext } from "@docks/api";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { randomUUID } from "node:crypto";
import { rateLimit, type RateLimitBinding } from "./rate-limit.js";

export type AppEnv = {
  Bindings: { TRPC_LIMITER?: RateLimitBinding };
  Variables: Record<string, never>;
};

const env = (k: string) => process.env[k];

/** Session resolution via Better Auth; missing/invalid session -> anonymous. */
async function createContext(req: Request): Promise<TrpcContext> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (session?.user) {
      const { id, name, email, emailVerified, image } = session.user;
      return { requestId, user: { id, name, email, emailVerified, image } };
    }
  } catch (err) {
    console.error(`[auth] getSession failed: ${(err as Error).message}`);
  }
  return { requestId, user: null };
}

export function createApp(opts: { afterWebhook?: () => void } = {}) {
  const app = new Hono<AppEnv>();
  const clientUrl = () => env("CLIENT_URL") ?? "http://localhost:3000";
  const origins = () => [
    clientUrl(),
    "http://localhost:3000",
    ...(env("CORS_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  ];

  app.use(secureHeaders());
  app.use(
    "*",
    cors({
      origin: (origin) => (origins().includes(origin) ? origin : null),
      credentials: true,
    }),
  );
  app.use("*", async (c, next) => {
    const t = Date.now();
    await next();
    console.log(`${c.req.method} ${new URL(c.req.url).pathname} ${c.res.status} ${Date.now() - t}ms`);
  });

  // Better Auth owns /api/auth/*.
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  // Webhooks verify signatures over the exact bytes.
  app.post("/webhooks/github", async (c) => {
    const body = Buffer.from(await c.req.arrayBuffer());
    if (!verifyGithubSignature(body, c.req.header("x-hub-signature-256"))) {
      return c.json({ error: "Invalid signature" }, 401);
    }
    const event = c.req.header("x-github-event") ?? "";
    try {
      await handleGithubEvent(event, JSON.parse(body.toString("utf8")));
      opts.afterWebhook?.();
      return c.json({ ok: true }, 202);
    } catch (err) {
      // 5xx makes GitHub show the delivery as failed so it can be redelivered.
      console.error(`[webhook] ${event} failed: ${(err as Error).message}`);
      return c.json({ error: "Webhook handling failed" }, 500);
    }
  });

  app.post("/webhooks/dodo-payments", async (c) => {
    const body = Buffer.from(await c.req.arrayBuffer());
    const headers = {
      "webhook-id": c.req.header("webhook-id") ?? "",
      "webhook-signature": c.req.header("webhook-signature") ?? "",
      "webhook-timestamp": c.req.header("webhook-timestamp") ?? "",
    };
    try {
      if (!(await handleBillingWebhook(body, headers))) return c.json({ error: "Invalid signature" }, 401);
      return c.json({ received: true });
    } catch (err) {
      console.error(`[billing] webhook failed: ${(err as Error).message}`);
      return c.json({ error: "Webhook handling failed" }, 500);
    }
  });

  // OAuth / install callbacks: session-checked redirects back to the web app.
  const sessionUser = async (req: Request) => (await auth.api.getSession({ headers: req.headers }))?.user;
  const backTo = (query: string) => (status: string) =>
    Response.redirect(`${clientUrl()}/settings/integrations?${query}=${status}`, 302);

  app.get("/integrations/github/callback", async (c) => {
    const back = backTo("github");
    const installationId = Number(c.req.query("installation_id"));
    const workspaceId = c.req.query("state") ?? "";
    if (!Number.isInteger(installationId) || !workspaceId) return back("invalid");
    const user = await sessionUser(c.req.raw);
    if (!user) return back("signed-out");
    try {
      await linkInstallation(user.id, installationId, workspaceId);
      return back("connected");
    } catch (err) {
      console.error(`[github] link installation ${installationId} failed: ${(err as Error).message}`);
      return back("failed");
    }
  });

  app.get("/integrations/github/oauth/callback", async (c) => {
    const back = backTo("account");
    const code = c.req.query("code") ?? "";
    const state = c.req.query("state") ?? "";
    if (!code || !state) return back("invalid");
    const user = await sessionUser(c.req.raw);
    if (!user) return back("signed-out");
    try {
      await completeAuthorization(user.id, code, state);
      return back("connected");
    } catch (err) {
      console.error(`[github] user authorization failed: ${(err as Error).message}`);
      return back("failed");
    }
  });

  app.get("/integrations/slack/callback", async (c) => {
    const back = backTo("slack");
    if (c.req.query("error")) return back("cancelled"); // person clicked "Cancel" on Slack
    const code = c.req.query("code") ?? "";
    const state = c.req.query("state") ?? "";
    if (!code || !state) return back("invalid");
    const user = await sessionUser(c.req.raw);
    if (!user) return back("signed-out");
    try {
      await connectSlack(user.id, code, state);
      return back("connected");
    } catch (err) {
      console.error(`[slack] connect failed: ${(err as Error).message}`);
      return back("failed");
    }
  });

  app.get("/healthz", (c) => c.json({ status: "ok", time: new Date().toISOString() }));

  // Board polling plus page loads stay well under this; scripts and abuse don't.
  app.use("/trpc/*", rateLimit({ windowMs: 60_000, max: 300, getBinding: (c) => (c.env as AppEnv["Bindings"] | undefined)?.TRPC_LIMITER }));
  app.all("/trpc/*", (c) =>
    fetchRequestHandler({
      endpoint: "/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext: ({ req }) => createContext(req),
      onError({ error, path }) {
        console.error(`[trpc] ${path} :: ${error.code}: ${error.message}`);
      },
    }),
  );

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  return app;
}
