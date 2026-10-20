import {
  appRouter,
  answerQuestion,
  auth,
  startQuestionStream,
  canJoinLive,
  completeAuthorization,
  connectSlack,
  handleBillingWebhook,
  handleGithubEvent,
  linkInstallation,
  verifyGithubSignature,
  recordServerError,
  recordWebhookDelivery,
  logEvent,
  logError,
  withLogContext,
  correlationId,
} from "@docks/api";
import type { Context as TrpcContext, WebhookDeliveryResult } from "@docks/api";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { checkReadiness } from "./readiness.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import { rateLimit, type RateLimitBinding } from "./rate-limit.js";

export type AppEnv = {
  Bindings: { TRPC_LIMITER?: RateLimitBinding };
  Variables: { requestId: string };
};

const env = (k: string) => process.env[k];
const clientUrl = () => env("CLIENT_URL") ?? "http://localhost:3000";
const allowedOrigins = () => [
  clientUrl(),
  "http://localhost:3000",
  ...(env("CORS_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

/** Session resolution via Better Auth; missing/invalid session -> anonymous. */
async function createContext(
  req: Request,
  requestId: string,
): Promise<TrpcContext> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (session?.user) {
      const { id, name, email, emailVerified, image } = session.user;
      return {
        requestId,
        user: { id, name, email, emailVerified, image },
        sessionId: session.session.id,
        sessionCreatedAt: new Date(session.session.createdAt),
      };
    }
  } catch (err) {
    logError("auth.failed", err);
  }
  return { requestId, user: null };
}

/**
 * Gate for GET /live (WebSocket). Browsers send cookies on cross-site socket
 * upgrades, so the Origin must be ours as well as the session valid.
 */
export async function authorizeLive(
  req: Request,
): Promise<{ userId: string; workspaceId: string } | Response> {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket")
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  if (!allowedOrigins().includes(req.headers.get("origin") ?? ""))
    return new Response("Forbidden", { status: 403 });
  const workspaceId = new URL(req.url).searchParams.get("workspaceId") ?? "";
  const ctx = await createContext(req, correlationId(null));
  if (!ctx.user || !workspaceId || !(await canJoinLive(ctx.user.id, workspaceId)))
    return new Response("Unauthorized", { status: 401 });
  return { userId: ctx.user.id, workspaceId };
}

export function createApp(
  opts: {
    afterWebhook?: () => void;
    observe?: (task: () => Promise<void>) => void;
    readiness?: () => Promise<boolean>;
  } = {},
) {
  const app = new Hono<AppEnv>();
  const observe = (task: () => Promise<void>) => {
    if (opts.observe) opts.observe(task);
    else void task();
  };
  const origins = allowedOrigins;

  app.use("*", async (c, next) => {
    const requestId = correlationId(c.req.header("x-request-id") ?? null);
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    const started = performance.now();
    await withLogContext({ requestId }, async () => {
      try {
        await next();
      } finally {
        const path = new URL(c.req.url).pathname;
        const route = path.startsWith("/trpc/")
          ? "/trpc/:procedure"
          : path.startsWith("/api/auth/")
            ? "/api/auth/:action"
            : [
                  "/healthz",
                  "/readyz",
                  "/webhooks/github",
                  "/webhooks/dodo-payments",
                  "/integrations/github/callback",
                  "/integrations/github/oauth/callback",
                  "/integrations/slack/callback",
                  "/live",
                ].includes(path)
              ? path
              : /^\/ask\/[^/]+\/stream$/.test(path)
                ? "/ask/:id/stream"
                : "unmatched";
        logEvent(c.res.status >= 500 ? "error" : "info", "http.completed", {
          method: c.req.method,
          route,
          status: c.res.status,
          durationMs: Math.round(performance.now() - started),
          source: "http",
        });
      }
    });
  });
  app.use(secureHeaders());
  app.use(
    "*",
    cors({
      origin: (origin) => (origins().includes(origin) ? origin : null),
      credentials: true,
      exposeHeaders: ["x-request-id"],
      maxAge: 86_400, // browsers skip the OPTIONS round trip before each save for a day
    }),
  );

  // Better Auth owns /api/auth/*.
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  // Webhooks verify signatures over the exact bytes.
  app.post("/webhooks/github", async (c) => {
    const receivedAt = new Date();
    const started = Date.now();
    const body = Buffer.from(await c.req.arrayBuffer());
    const event = c.req.header("x-github-event") ?? "";
    const deliveryId = c.req.header("x-github-delivery") ?? null;
    // Metadata only: the installation id powers the admin filter. The
    // payload itself is never stored (see `webhook_delivery`).
    let installationId: number | null = null;
    try {
      const parsed = JSON.parse(body.toString("utf8")) as {
        installation?: { id?: unknown };
      };
      if (typeof parsed?.installation?.id === "number") {
        installationId = parsed.installation!.id as number;
      }
    } catch {
      installationId = null;
    }
    // Fire-and-forget: delivery recording never delays or breaks the response.
    const track = (result: WebhookDeliveryResult, reason?: unknown) =>
      observe(() =>
        recordWebhookDelivery({
          deliveryId,
          installationId,
          event,
          result,
          reason,
          durationMs: Date.now() - started,
          receivedAt,
        }),
      );
    if (!verifyGithubSignature(body, c.req.header("x-hub-signature-256"))) {
      track("signature_rejected", "Invalid signature");
      return c.json({ error: "Invalid signature" }, 401);
    }
    try {
      let payload: Parameters<typeof handleGithubEvent>[1];
      try {
        payload = JSON.parse(body.toString("utf8"));
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new Error("Invalid webhook payload");
        }
      } catch {
        // JSON parse errors can quote raw payload bytes; never persist those.
        throw new Error("Invalid webhook JSON payload");
      }
      await handleGithubEvent(event, payload, deliveryId ?? undefined);
      track("ok");
      opts.afterWebhook?.();
      return c.json({ ok: true }, 202);
    } catch (err) {
      // 5xx makes GitHub show the delivery as failed so it can be redelivered.
      logError("webhook.failed", err);
      track("failed", err);
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
      if (!(await handleBillingWebhook(body, headers)))
        return c.json({ error: "Invalid signature" }, 401);
      return c.json({ received: true });
    } catch (err) {
      logError("billing.failed", err);
      return c.json({ error: "Webhook handling failed" }, 500);
    }
  });

  // OAuth / install callbacks: session-checked redirects back to the web app.
  const sessionUser = async (req: Request) =>
    (await auth.api.getSession({ headers: req.headers }))?.user;
  const backTo = (query: string) => (status: string) =>
    Response.redirect(
      `${clientUrl()}/settings/integrations?${query}=${status}`,
      302,
    );

  app.get("/integrations/github/callback", async (c) => {
    const [workspaceId = "", returnTo] = (c.req.query("state") ?? "").split(
      ".",
    );
    const back =
      returnTo === "onboarding"
        ? (status: string) =>
            Response.redirect(`${clientUrl()}/review?github=${status}`, 302)
        : backTo("github");
    const installationId = Number(c.req.query("installation_id"));
    if (!Number.isInteger(installationId) || !workspaceId)
      return back("invalid");
    const user = await sessionUser(c.req.raw);
    if (!user) return back("signed-out");
    try {
      await linkInstallation(user.id, installationId, workspaceId);
      return back("connected");
    } catch (err) {
      logError("github.failed", err);
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
      logError("github.failed", err);
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
      logError("slack.failed", err);
      return back("failed");
    }
  });

  // Ask answers as server-sent events: `delta` chunks, then `done` with the saved question.
  app.get("/ask/:id/stream", async (c) => {
    const ctx = await createContext(c.req.raw, c.get("requestId"));
    if (!ctx.user) return c.json({ error: "Not authenticated" }, 401);
    const id = c.req.param("id");
    if (!/^[0-9a-f-]{36}$/.test(id)) return c.json({ error: "Not found" }, 404);
    const claimed = await startQuestionStream(id, ctx.user.id).catch(() => null);
    if (!claimed) return c.json({ error: "This question isn't waiting for an answer" }, 409);
    return streamSSE(c, async (stream) => {
      try {
        const saved = await answerQuestion(id, (text) => {
          void stream.writeSSE({ event: "delta", data: JSON.stringify({ text }) });
        });
        await stream.writeSSE({ event: "done", data: JSON.stringify({ id: saved.id, status: saved.status }) });
      } catch {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ message: "Couldn't get an answer right now. Try again." }) });
      }
    });
  });

  app.get("/healthz", (c) =>
    c.json({ status: "ok", time: new Date().toISOString() }),
  );

  // Board polling plus page loads stay well under this; scripts and abuse don't.
  app.use(
    "/trpc/*",
    rateLimit({
      windowMs: 60_000,
      max: 300,
      getBinding: (c) =>
        (c.env as AppEnv["Bindings"] | undefined)?.TRPC_LIMITER,
    }),
  );
  app.all("/trpc/*", (c) =>
    fetchRequestHandler({
      endpoint: "/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext: ({ req }) => createContext(req, c.get("requestId")),
      onError({ error, path }) {
        if (error.code !== "INTERNAL_SERVER_ERROR" && error.code !== "TIMEOUT")
          return;
        logError("trpc.failed", error, {
          operation: path ?? "unknown",
          code: error.code,
        });
        // Best-effort grouping for the admin errors view; never breaks the response.
        observe(() =>
          recordServerError(
            error,
            `[trpc ${path ?? "unknown"} ${error.code}] `,
          ),
        );
      },
    }),
  );

  app.get("/readyz", async (c) => {
    c.header("Cache-Control", "no-store");
    const ready = await (opts.readiness ?? checkReadiness)();
    return c.json({ status: ready ? "ok" : "unavailable" }, ready ? 200 : 503);
  });
  app.onError((error, c) => {
    logError("http.failed", error, { requestId: c.get("requestId") });
    observe(() => recordServerError(error, "[http] "));
    return c.json(
      { error: "Internal server error", requestId: c.get("requestId") },
      500,
    );
  });
  app.notFound((c) => c.json({ error: "Not found" }, 404));
  return app;
}
