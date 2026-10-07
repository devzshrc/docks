/**
 * Cache shared by every Worker instance (Cloudflare KV), with an in-process layer in front of it
 * and as the only layer when no KV is bound (Node dev, tests). Meant for slow-changing,
 * JSON-safe data (labels, assignees, repo flags). KV is eventually consistent and expires in
 * whole minutes, so anything a person just edited must not come from here.
 */
export interface KvLike {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

let kv: KvLike | undefined;
/** The Worker entry binds KV once per request (a no-op when it is already set). */
export const useKv = (binding: KvLike | undefined) => {
  kv = binding;
};

const mem = new Map<string, { exp: number; value: unknown }>();
const KV_MIN_TTL_MS = 60_000;

function remember(key: string, ttlMs: number, value: unknown) {
  if (mem.size >= 500) mem.delete(mem.keys().next().value!);
  mem.set(key, { exp: Date.now() + ttlMs, value });
}

/** Read through memory, then KV; `store` writes both. Cache trouble never fails a request. */
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const hit = mem.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as T;
  if (!kv) return undefined;
  try {
    const stored = (await kv.get(`c:${key}`, "json")) as { v: T; ttl: number } | null;
    if (stored) {
      remember(key, Math.min(stored.ttl, 30_000), stored.v);
      return stored.v;
    }
  } catch {
    /* fall through to a fresh load */
  }
  return undefined;
}

export async function cacheSet(key: string, ttlMs: number, value: unknown, opts: { local?: boolean } = {}) {
  remember(key, ttlMs, value);
  if (!kv || opts.local || ttlMs < KV_MIN_TTL_MS) return;
  try {
    await kv.put(`c:${key}`, JSON.stringify({ v: value, ttl: ttlMs }), { expirationTtl: Math.ceil(ttlMs / 1000) });
  } catch {
    /* best effort */
  }
}

/** `local: true` keeps a value in this instance only (not JSON-safe, or very short-lived). */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, opts: { local?: boolean } = {}): Promise<T> {
  const hit = opts.local ? (mem.get(key)?.exp ?? 0) > Date.now() ? (mem.get(key)!.value as T) : undefined : await cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await load();
  await cacheSet(key, ttlMs, value, opts);
  return value;
}
