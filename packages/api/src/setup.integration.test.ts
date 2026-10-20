import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { test } from "node:test";
import { closeDb, db, schema } from "@docks/db";
import { eq, inArray } from "drizzle-orm";
import { encrypt } from "./crypto.js";
import { appRouter } from "./routers/_app.js";

process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

test("setup health, failed jobs, retries and invite suggestions", { skip: !process.env.DOCKS_TEST_DATABASE_URL }, async (t) => {
  assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
  const id = randomUUID();
  const base = Date.now() % 1_000_000_000;
  const owner = { id: `${id}-o`, name: "O", email: `${id}-o@example.test`, emailVerified: true, image: null };
  const member = { id: `${id}-m`, name: "M", email: `${id}-m@example.test`, emailVerified: true, image: null };
  const realFetch = globalThis.fetch;
  process.env.GITHUB_APP_ID = "1";
  process.env.GITHUB_APP_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    if (path.includes(`/app/installations/${base}`)) return Response.json({ id: base, account: { login: "acme", type: "Organization" }, suspended_at: null, permissions: { pull_requests: "read", metadata: "read", contents: "read", checks: "read", issues: "write" } });
    return realFetch(url, init);
  }) as typeof fetch;
  t.after(async () => {
    globalThis.fetch = realFetch;
    await db.delete(schema.jobs).where(inArray(schema.jobs.id, jobIds));
    await db.delete(schema.webhookDelivery).where(eq(schema.webhookDelivery.installationId, base));
    await db.delete(schema.workspace).where(eq(schema.workspace.id, id));
    for (const u of [owner, member]) await db.delete(schema.user).where(eq(schema.user.id, u.id));
    await closeDb();
  });
  let jobIds: number[] = [];
  await db.insert(schema.user).values([owner, member]);
  await db.insert(schema.workspace).values({ id, name: "Setup", slug: id });
  await db.insert(schema.workspaceMember).values([
    { workspaceId: id, userId: owner.id, role: "owner" },
    { workspaceId: id, userId: member.id, role: "member" },
  ]);
  const ownerApi = appRouter.createCaller({ requestId: id, user: owner } as never);
  const memberApi = appRouter.createCaller({ requestId: id, user: member } as never);

  await t.test("a fresh workspace says what to install", async () => {
    const h = await ownerApi.setup.health({ workspaceId: id });
    const app = h.checks.find((c) => c.id === "github_app")!;
    assert.equal(app.status, "fail");
    assert.equal(app.fix?.href, "/settings/integrations");
    assert.equal(h.checks.find((c) => c.id === "repos")!.status, "fail");
  });

  await db.insert(schema.githubInstallation).values({ id: base, workspaceId: id, accountLogin: "acme", accountType: "Organization" });
  await db.insert(schema.repository).values({ id: base, installationId: base, fullName: `acme/${id}`, defaultBranch: "main" });
  await db.insert(schema.githubIdentity).values({ userId: owner.id, githubLogin: `own-${base}`, githubUserId: base, accessTokenEncrypted: encrypt("x") });
  await db.insert(schema.webhookDelivery).values({ installationId: base, event: "pull_request", result: "signature_rejected", reason: "bad sig" });

  await t.test("installed: permissions, webhooks and access are explained", async () => {
    const h = await ownerApi.setup.health({ workspaceId: id });
    const by = Object.fromEntries(h.checks.map((c) => [c.id, c]));
    assert.equal(by.github_app!.status, "ok");
    assert.match(by.app_permissions!.detail, /pull requests \(write\)/);
    assert.equal(by.webhooks!.status, "fail");
    assert.equal(by.webhooks!.fix?.action, "webhook_test");
    assert.equal(by.my_access!.status, "warn");
    assert.equal(by.my_access!.fix?.action, "permission_check");
    // Members see the state but not the admin-only fix.
    const mh = await memberApi.setup.health({ workspaceId: id });
    assert.equal(mh.checks.find((c) => c.id === "webhooks")!.fix, undefined);
    assert.equal(mh.checks.find((c) => c.id === "my_github")!.status, "warn");
  });

  await t.test("failed jobs are listed, explained, and retried once", async () => {
    const rows = await db
      .insert(schema.jobs)
      .values([
        { type: "sync_pr", payload: { repoId: base, number: 4 }, status: "failed", attempts: 5, lastError: "GitHub 404 /repos/x/pulls/4: Not Found" },
        { type: "slack_digest", payload: { repoId: base }, status: "failed", attempts: 1, lastError: "x" },
      ])
      .returning({ id: schema.jobs.id });
    jobIds = rows.map((r) => r.id);
    const failed = await ownerApi.setup.failedJobs({ workspaceId: id });
    assert.equal(failed.length, 1);
    assert.match(failed[0]!.reason, /deleted, renamed/);
    assert.equal((await ownerApi.setup.health({ workspaceId: id })).failedJobs, 1);
    await ownerApi.setup.retryJob({ workspaceId: id, jobId: failed[0]!.id });
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, failed[0]!.id));
    assert.equal(job!.status, "queued");
    await assert.rejects(ownerApi.setup.retryJob({ workspaceId: id, jobId: failed[0]!.id }), /Only failed jobs/);
    await assert.rejects(memberApi.setup.failedJobs({ workspaceId: id }), /role doesn't allow/);
  });

  await t.test("invite suggestions come from GitHub activity, minus members and bots", async () => {
    await db.insert(schema.pullRequest).values(
      ["zoe", "zoe", "dependabot", `own-${base}`].map((login, i) => ({
        repoId: base, number: 100 + i, title: "x", authorLogin: login, state: "open" as const, headRef: "f", headSha: "a".repeat(40), baseRef: "main", reviewColumn: "waiting" as const, lastActivityAt: new Date(),
      })),
    );
    await db.insert(schema.prReview).values({ id: base * 3, repoId: base, prNumber: 100, reviewerLogin: "yan", state: "APPROVED", submittedAt: new Date() });
    assert.deepEqual(await ownerApi.setup.inviteSuggestions({ workspaceId: id }), [
      { login: "zoe", activity: 2 },
      { login: "yan", activity: 1 },
    ]);
    await db.delete(schema.prReview).where(eq(schema.prReview.repoId, base));
  });
});
