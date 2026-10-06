import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Secrets at rest (plan.md §10). TOKEN_ENCRYPTION_KEY is 32 bytes, base64:
 *   openssl rand -base64 32
 */
function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  const buf = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (buf.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return buf;
}

/** AES-256-GCM. Output: iv.tag.ciphertext, each base64url. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !data) throw new Error("Malformed encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** HMAC-signed value for OAuth `state`; binds the flow to one user and expires. */
export function signState(userId: string, ttlMs = 10 * 60_000): string {
  const payload = `${userId}.${Date.now() + ttlMs}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifyState(state: string, userId: string): boolean {
  const [id, expires, mac] = state.split(".");
  if (!id || !expires || !mac || id !== userId || Number(expires) < Date.now()) return false;
  const expected = Buffer.from(hmac(`${id}.${expires}`));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function hmac(value: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(value).digest("base64url");
}
