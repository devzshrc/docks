import type { RequestHandler } from "express";

/**
 * Fixed-window limiter for /trpc, keyed by session cookie or IP.
 * ponytail: in-memory per process; move to Postgres/Redis when running more than one instance.
 */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [key, v] of hits) if (v.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const cookie = req.headers.cookie?.match(/better-auth\.session_token=([^;]+)/)?.[1];
    const key = cookie ? `s:${cookie}` : `ip:${req.ip}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({ error: "Too many requests. Slow down and try again shortly." });
      return;
    }
    next();
  };
}
