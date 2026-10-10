import { serve } from "@hono/node-server";
import { auth } from "@docks/api";
import { db, schema, closeDb, eq, inArray } from "@docks/db";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { totp } from "../../web/e2e/totp.js";

// This entry point is only used by Playwright. Never load production dotenv files.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
if (
  process.env.DOCKS_E2E !== "1" ||
  process.env.DATABASE_URL !== process.env.DOCKS_TEST_DATABASE_URL ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !/test/.test(url.pathname)
)
  throw new Error(
    "E2E requires an explicitly selected local disposable test database",
  );
if (
  process.env.BETTER_AUTH_URL !== "http://localhost:4000" ||
  process.env.RESEND_API_KEY
)
  throw new Error(
    "E2E must use local authentication without external email delivery",
  );
const prefix = randomUUID();
const ownerEmail = `owner-${prefix}@example.test`,
  memberEmail = `member-${prefix}@example.test`;
process.env.ADMIN_EMAILS = ownerEmail;
process.env.ADMIN_SUPPORT_EMAILS = "";
process.env.ADMIN_VIEWER_EMAILS = "";
const password = `Fixture-${randomUUID()}!`;
const ids: string[] = [];
const workspaceId = `e2e-${prefix}`;
const fixtureDir = fileURLToPath(
  new URL("../../web/e2e/.auth/", import.meta.url),
);
async function createUser(email: string, name: string) {
  const result = await auth.api.signUpEmail({
    body: { email, password, name },
  });
  ids.push(result.user.id);
  await db
    .update(schema.user)
    .set({ emailVerified: true })
    .where(eq(schema.user.id, result.user.id));
  return result.user.id;
}
const ownerId = await createUser(ownerEmail, "E2E owner");
const memberId = await createUser(memberEmail, "E2E member");
async function createSocialAccount(project: string) {
  const socialEmail = `github-${project}-${prefix}@example.test`;
  const socialId = await createUser(socialEmail, "E2E GitHub member");
  const socialLogin = await auth.api.signInEmail({
    body: { email: socialEmail, password },
    asResponse: true,
  });
  const socialCookie = socialLogin.headers.get("set-cookie")!.split(";")[0]!;
  await db.delete(schema.account).where(eq(schema.account.userId, socialId));
  await db.insert(schema.account).values({
    id: randomUUID(),
    userId: socialId,
    providerId: "github",
    accountId: `${project}-${prefix}`,
  });
  const socialResetToken = randomUUID();
  await db.insert(schema.verification).values({
    id: randomUUID(),
    identifier: `reset-password:${socialResetToken}`,
    value: socialId,
    expiresAt: new Date(Date.now() + 3600000),
  });
  return { socialEmail, socialId, socialCookie, socialResetToken };
}
const socialAccounts = {
  desktop: await createSocialAccount("desktop"),
  mobile: await createSocialAccount("mobile"),
};
const login = await auth.api.signInEmail({
  body: { email: ownerEmail, password },
  asResponse: true,
});
const headers = new Headers({
  cookie: login.headers.get("set-cookie")!.split(";")[0]!,
});
const setup = await auth.api.enableTwoFactor({ body: { password }, headers });
if (setup.method !== "totp") throw new Error("Expected TOTP setup");
const secret = new URL(setup.totpURI).searchParams.get("secret")!;
await auth.api.verifyTOTP({ body: { code: totp(secret) }, headers });
await db.delete(schema.session).where(eq(schema.session.userId, ownerId));
await db
  .insert(schema.workspace)
  .values({ id: workspaceId, slug: workspaceId, name: "E2E workspace" });
await db
  .insert(schema.workspaceMember)
  .values({ workspaceId, userId: memberId, role: "owner" });
await db
  .insert(schema.workspaceMember)
  .values(
    Object.values(socialAccounts).map(({ socialId }) => ({
      workspaceId,
      userId: socialId,
      role: "member" as const,
    })),
  );
mkdirSync(fixtureDir, { recursive: true });
writeFileSync(
  `${fixtureDir}/accounts.json`,
  JSON.stringify({
    ownerEmail,
    memberEmail,
    password,
    secret,
    memberId,
    workspaceId,
    socialAccounts,
  }),
  { mode: 0o600 },
);
const server = serve({ fetch: createApp().fetch, port: 4000 });
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  await db
    .delete(schema.adminAudit)
    .where(inArray(schema.adminAudit.actorId, ids));
  await db.delete(schema.workspace).where(eq(schema.workspace.id, workspaceId));
  await db.delete(schema.user).where(inArray(schema.user.id, ids));
  await db.delete(schema.verification).where(
    inArray(
      schema.verification.value,
      Object.values(socialAccounts).map(({ socialId }) => socialId),
    ),
  );
  rmSync(fixtureDir, { recursive: true, force: true });
  await closeDb();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
