import type { MiddlewareHandler } from "hono";

/** Cloudflare Rate Limiting binding (see wrangler.jsonc). */
export type RateLimitBinding = { limit(opts: { key: string }): Promise<{ success: boolean }> };

const sessionKey = (cookie: string | undefined, ip: string | undefined) => {
  const token = cookie?.match(/better-auth\.session_token=([^;]+)/)?.[1];
  return token ? `s:${token}` : `ip:${ip ?? "unknown"}`;
};

const tooMany = (retryAfter: number) =>
  new Response(JSON.stringify({ error: "Too many requests. Slow down and try again shortly." }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfter) },
  });

/**
 * Fixed-window limiter, keyed by session cookie or IP. Uses the Workers Rate Limiting
 * binding when `getBinding` returns one; otherwise an in-memory map (Node dev / single instance).
 */
export function rateLimit({
  windowMs,
  max,
  getBinding,
}: {
  windowMs: number;
  max: number;
  getBinding?: (c: Parameters<MiddlewareHandler>[0]) => RateLimitBinding | undefined;
}): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    const key = sessionKey(c.req.header("cookie"), ip);

    const binding = getBinding?.(c);
    if (binding) {
      const { success } = await binding.limit({ key });
      return success ? next() : tooMany(Math.ceil(windowMs / 1000));
    }

    const now = Date.now();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) return tooMany(Math.ceil((entry.resetAt - now) / 1000));
    return next();
  };
}
