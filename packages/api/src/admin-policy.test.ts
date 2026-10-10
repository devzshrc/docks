import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertAdminAccess,
  assertAdminWrite,
  deviceLabel,
  effectivePlan,
  platformRole,
} from "./admin-policy.js";
const now = new Date("2026-10-10T12:00:00Z");
test("platform roles are explicit, normalized and independent of workspace roles", () => {
  const env = {
    ADMIN_EMAILS: " Owner@example.com ",
    ADMIN_SUPPORT_EMAILS: "support@example.com",
    ADMIN_VIEWER_EMAILS: "viewer@example.com",
  };
  assert.equal(platformRole("OWNER@example.com", env), "owner");
  assert.equal(platformRole("support@example.com", env), "support");
  assert.equal(platformRole("viewer@example.com", env), "viewer");
  assert.equal(platformRole("workspace-owner@example.com", env), null);
});
test("admin access requires verification and two-factor authentication", () => {
  assert.throws(() =>
    assertAdminAccess(
      { email: "a", emailVerified: true, twoFactorEnabled: true },
      null,
    ),
  );
  assert.throws(() =>
    assertAdminAccess(
      { email: "a", emailVerified: false, twoFactorEnabled: true },
      "owner",
    ),
  );
  assert.throws(() =>
    assertAdminAccess({ email: "a", emailVerified: true }, "owner"),
  );
  assert.doesNotThrow(() =>
    assertAdminAccess(
      { email: "a", emailVerified: true, twoFactorEnabled: true },
      "owner",
    ),
  );
});
test("sensitive changes require an authorized role and a fresh session", () => {
  assert.throws(() => assertAdminWrite("viewer", now, false, now));
  assert.throws(() => assertAdminWrite("support", now, true, now));
  assert.throws(() => assertAdminWrite("owner", undefined, false, now));
  assert.throws(() =>
    assertAdminWrite("owner", new Date(now.getTime() - 31 * 60000), false, now),
  );
  assert.throws(() =>
    assertAdminWrite("owner", new Date(now.getTime() + 1000), false, now),
  );
  assert.doesNotThrow(() => assertAdminWrite("support", now, false, now));
});
test("premium respects start, exact expiry, revocation and paid access", () => {
  const valid = {
    startsAt: new Date(now.getTime() - 1000),
    expiresAt: null,
    revokedAt: null,
  };
  assert.equal(effectivePlan("free", [valid], now), "team");
  assert.equal(
    effectivePlan("free", [{ ...valid, expiresAt: now }], now),
    "free",
  );
  assert.equal(
    effectivePlan("free", [{ ...valid, revokedAt: now }], now),
    "free",
  );
  assert.equal(
    effectivePlan(
      "free",
      [{ ...valid, startsAt: new Date(now.getTime() + 1000) }],
      now,
    ),
    "free",
  );
  assert.equal(
    effectivePlan("team", [{ ...valid, revokedAt: now }], now),
    "team",
  );
});
test("device labels disclose inference without returning the user-agent", () => {
  assert.equal(deviceLabel(null), "Unknown device");
  assert.equal(
    deviceLabel("Mozilla Macintosh Chrome/120 Safari/537"),
    "Chrome · macOS",
  );
  assert.equal(deviceLabel("Mozilla iPhone Safari/604"), "Safari · iOS");
});
