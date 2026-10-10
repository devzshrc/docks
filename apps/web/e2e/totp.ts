import { createHmac } from "node:crypto";

/** RFC 6238 code for disposable authenticator fixtures. */
export function totp(secret: string, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.toUpperCase().replace(/=+$/, "")]
    .map((c) => {
      const index = alphabet.indexOf(c);
      if (index < 0) throw new Error("Invalid fixture TOTP secret");
      return index.toString(2).padStart(5, "0");
    })
    .join("");
  const bytes = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const hash = createHmac("sha1", bytes).update(counter).digest();
  const offset = hash[hash.length - 1]! & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
