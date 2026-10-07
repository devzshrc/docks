import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
const { columnsFromSignIn } = await import("./github-user.js");
const { decrypt } = await import("../crypto.js");

test("sign-in tokens are sealed, with expiries kept only when there is a refresh token", () => {
  const exp = new Date("2026-10-07T12:00:00Z");
  const full = columnsFromSignIn({ accessToken: "ghu_access", refreshToken: "ghr_refresh", accessTokenExpiresAt: exp, refreshTokenExpiresAt: exp });
  assert.notEqual(full.accessTokenEncrypted, "ghu_access");
  assert.equal(decrypt(full.accessTokenEncrypted), "ghu_access");
  assert.equal(decrypt(full.refreshTokenEncrypted!), "ghr_refresh");
  assert.equal(full.refreshTokenExpiresAt, exp);

  const bare = columnsFromSignIn({ accessToken: "ghu_only" });
  assert.equal(bare.refreshTokenEncrypted, null);
  assert.equal(bare.refreshTokenExpiresAt, null);
  assert.equal(bare.accessTokenExpiresAt, null);
});
