import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { db, schema, closeDb } from "@docks/db";
import { and, eq, sql } from "drizzle-orm";
import { appRouter } from "./routers/_app.js";
import { workspacePlan, assertTeam } from "./plans.js";
import { auth } from "./auth.js";

test(
  "administration end-to-end against isolated Postgres",
  { skip: !process.env.DOCKS_TEST_DATABASE_URL },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
    assert.match(
      process.env.DATABASE_URL!,
      /test/,
      "Use a disposable test database",
    );
    const prefix = randomUUID();
    const people = ["owner", "support", "viewer", "member"].map((role) => ({
      id: `${prefix}-${role}`,
      name: role,
      email: `${prefix}-${role}@example.test`,
      emailVerified: true,
      image: null,
      twoFactorEnabled: true,
    }));
    process.env.ADMIN_EMAILS = people[0]!.email;
    process.env.ADMIN_SUPPORT_EMAILS = people[1]!.email;
    process.env.ADMIN_VIEWER_EMAILS = people[2]!.email;
    const caller = (i: number, age = 0) =>
      appRouter.createCaller({
        user: people[i]!,
        requestId: prefix,
        sessionCreatedAt: new Date(Date.now() - age),
      });
    const owner = caller(0),
      support = caller(1),
      viewer = caller(2),
      member = caller(3);
    const ws = prefix;
    let authUserId: string | undefined;
    const insertedJobs: number[] = [];
    try {
      await db.insert(schema.user).values(people);
      await db
        .insert(schema.workspace)
        .values({ id: ws, slug: prefix, name: "Fixture workspace" });
      await db
        .insert(schema.workspaceMember)
        .values({ workspaceId: ws, userId: people[3]!.id, role: "owner" });
      await t.test(
        "anonymous and workspace owners cannot read platform data",
        async () => {
          await assert.rejects(
            appRouter
              .createCaller({ user: null, requestId: prefix })
              .admin.users({}),
            /Not authenticated/,
          );
          await assert.rejects(member.admin.users({}), /Not found/);
        },
      );
      await t.test(
        "read-only admins cannot mutate, support cannot grant premium, old sessions cannot mutate",
        async () => {
          assert.equal((await viewer.admin.access()).role, "viewer");
          await assert.rejects(
            viewer.admin.revokeSessions({
              userId: people[3]!.id,
              reason: "Test revoke",
            }),
            /cannot perform/,
          );
          await assert.rejects(
            support.admin.grantPremium({
              workspaceId: ws,
              expiresAt: null,
              reason: "Test grant",
            }),
            /cannot perform/,
          );
          await assert.rejects(
            caller(0, 31 * 60000).admin.grantPremium({
              workspaceId: ws,
              expiresAt: null,
              reason: "Test grant",
            }),
            /Sign out/,
          );
        },
      );
      await t.test(
        "2FA and verification are enforced on actual admin endpoints",
        async () => {
          await db
            .update(schema.user)
            .set({ twoFactorEnabled: false })
            .where(eq(schema.user.id, people[2]!.id));
          await assert.rejects(viewer.admin.access(), /two-factor/);
          await db
            .update(schema.user)
            .set({ twoFactorEnabled: true })
            .where(eq(schema.user.id, people[2]!.id));
          await assert.rejects(
            appRouter
              .createCaller({
                user: { ...people[0]!, emailVerified: false },
                requestId: prefix,
              })
              .admin.access(),
            /Verify/,
          );
        },
      );
      await t.test(
        "users support search, status, pagination and safe session projections",
        async () => {
          const first = await owner.admin.users({ search: prefix, limit: 2 });
          assert.equal(first.total, 4);
          assert.equal(first.rows.length, 2);
          const next = await owner.admin.users({
            search: prefix,
            limit: 2,
            offset: 2,
          });
          assert.equal(
            new Set([...first.rows, ...next.rows].map((u) => u.id)).size,
            4,
          );
          await db.insert(schema.session).values({
            id: `${prefix}-session`,
            token: "secret-session-token",
            userId: people[3]!.id,
            createdAt: new Date(),
            updatedAt: new Date(),
            expiresAt: new Date(Date.now() + 60000),
            userAgent: "Macintosh Chrome/120",
            ipAddress: "127.0.0.1",
          });
          const detail = await owner.admin.user({ userId: people[3]!.id });
          assert.equal(detail.sessions[0]!.device, "Chrome · macOS");
          assert.ok(!JSON.stringify(detail).includes("secret-session-token"));
          assert.ok(!("token" in detail.sessions[0]!));
        },
      );
      await t.test(
        "session IDs cannot revoke another user's session",
        async () => {
          await assert.rejects(
            owner.admin.revokeSessions({
              userId: people[1]!.id,
              sessionId: `${prefix}-session`,
              reason: "Wrong target test",
            }),
            /Session not found/,
          );
          assert.equal(
            (await owner.admin.user({ userId: people[3]!.id })).sessions.length,
            1,
          );
          await support.admin.revokeSessions({
            userId: people[3]!.id,
            sessionId: `${prefix}-session`,
            reason: "Support revoke test",
          });
          assert.equal(
            (await owner.admin.user({ userId: people[3]!.id })).sessions.length,
            0,
          );
        },
      );
      await t.test(
        "premium grants affect feature guards and expiry without touching subscription fields",
        async () => {
          await owner.admin.grantPremium({
            workspaceId: ws,
            expiresAt: new Date(Date.now() + 60000),
            reason: "Complimentary access test",
          });
          assert.equal(await workspacePlan(ws), "team");
          await assertTeam(ws);
          const [stored] = await db
            .select()
            .from(schema.workspace)
            .where(eq(schema.workspace.id, ws));
          assert.equal(stored!.plan, "free");
          assert.equal(stored!.billingSubscriptionId, null);
          assert.equal(
            (await owner.admin.workspace({ workspaceId: ws })).effectivePlan,
            "team",
          );
          await db
            .update(schema.premiumGrant)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(eq(schema.premiumGrant.workspaceId, ws));
          assert.equal(await workspacePlan(ws), "free");
          await assert.rejects(
            owner.admin.grantPremium({
              workspaceId: ws,
              expiresAt: new Date(0),
              reason: "Expired grant test",
            }),
            /future/,
          );
          await owner.admin.grantPremium({
            workspaceId: ws,
            expiresAt: null,
            reason: "Indefinite grant test",
          });
          await db
            .update(schema.workspace)
            .set({
              plan: "team",
              billingSubscriptionId: `${prefix}-paid`,
              subscriptionStatus: "active",
            })
            .where(eq(schema.workspace.id, ws));
          await owner.admin.revokePremium({
            workspaceId: ws,
            reason: "Revoke complimentary test",
          });
          assert.equal(
            await workspacePlan(ws),
            "team",
            "Paid access survives grant revocation",
          );
          await db
            .update(schema.workspace)
            .set({
              plan: "free",
              billingSubscriptionId: null,
              subscriptionStatus: "cancelled",
            })
            .where(eq(schema.workspace.id, ws));
          await owner.admin.grantPremium({
            workspaceId: ws,
            expiresAt: null,
            reason: "After cancellation grant",
          });
          assert.equal(
            await workspacePlan(ws),
            "team",
            "Complimentary access survives a paid downgrade",
          );
        },
      );
      await t.test(
        "suspension stops protected actions, signs out devices, and protects owners",
        async () => {
          await assert.rejects(
            owner.admin.setAccountStatus({
              userId: people[0]!.id,
              suspended: true,
              reason: "Self suspension test",
            }),
            /owners cannot/,
          );
          await owner.admin.setAccountStatus({
            userId: people[3]!.id,
            suspended: true,
            reason: "Account suspension test",
          });
          await assert.rejects(member.workspace.list(), /suspended/);
          assert.equal(
            (await owner.admin.users({ search: prefix, status: "suspended" }))
              .total,
            1,
          );
          await owner.admin.setAccountStatus({
            userId: people[3]!.id,
            suspended: false,
            reason: "Reactivate account test",
          });
          assert.ok(await member.workspace.list());
        },
      );
      await t.test(
        "only failed safe sync jobs can be retried; payloads are never exposed",
        async () => {
          const jobs = await db
            .insert(schema.jobs)
            .values([
              {
                type: "sync_repo",
                status: "failed",
                payload: { token: "do-not-expose" },
                attempts: 5,
                lastError: "secret-error",
              },
              { type: "slack_digest", status: "failed", payload: {} },
            ])
            .returning();
          insertedJobs.push(...jobs.map((j) => j.id));
          const data = await owner.admin.health({});
          assert.ok(!JSON.stringify(data).includes("do-not-expose"));
          assert.ok(!JSON.stringify(data).includes("secret-error"));
          await assert.rejects(
            owner.admin.retryJob({
              jobId: jobs[1]!.id,
              reason: "Unsafe retry test",
            }),
            /cannot be retried/,
          );
          await support.admin.retryJob({
            jobId: jobs[0]!.id,
            reason: "Safe sync retry test",
          });
          await assert.rejects(
            support.admin.retryJob({
              jobId: jobs[0]!.id,
              reason: "Duplicate retry test",
            }),
            /Only failed/,
          );
        },
      );
      await t.test(
        "login recording, session revocation and suspension work through Better Auth",
        async () => {
          const email = `${prefix}-auth@example.test`,
            password = "Fixture-password-strong-123!";
          const signed = await auth.api.signUpEmail({
            body: { email, password, name: "Auth fixture" },
          });
          authUserId = signed.user.id;
          await db
            .update(schema.user)
            .set({ emailVerified: true })
            .where(eq(schema.user.id, authUserId));
          const login = await auth.api.signInEmail({
            body: { email, password },
            asResponse: true,
          });
          assert.equal(login.status, 200);
          const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
          const headers = new Headers({ cookie });
          assert.ok((await auth.api.getSession({ headers }))?.user);
          await owner.admin.revokeSessions({
            userId: authUserId,
            reason: "Auth revocation test",
          });
          assert.equal(
            await auth.api.getSession({ headers }),
            null,
            "No cached session survives revocation",
          );
          await owner.admin.setAccountStatus({
            userId: authUserId,
            suspended: true,
            reason: "Auth suspension test",
          });
          await assert.rejects(
            auth.api.signInEmail({ body: { email, password } }),
            /suspended/,
          );
          await owner.admin.setAccountStatus({
            userId: authUserId,
            suspended: false,
            reason: "Auth reactivation test",
          });
          assert.ok(await auth.api.signInEmail({ body: { email, password } }));
          const authEvents = await db
            .select()
            .from(schema.authEvent)
            .where(eq(schema.authEvent.userId, authUserId));
          assert.ok(authEvents.some((e) => e.kind === "login"));
          await db
            .update(schema.user)
            .set({ twoFactorEnabled: true })
            .where(eq(schema.user.id, authUserId));
          const challenge = await auth.api.signInEmail({
            body: { email, password },
          });
          assert.ok(
            "twoFactorRedirect" in challenge && challenge.twoFactorRedirect,
          );
          const afterChallenge = await db
            .select()
            .from(schema.authEvent)
            .where(eq(schema.authEvent.userId, authUserId));
          assert.equal(
            afterChallenge.filter((e) => e.kind === "login").length,
            authEvents.filter((e) => e.kind === "login").length,
            "An unfinished 2FA challenge is not a successful login",
          );
        },
      );
      await t.test(
        "audit insertion failure rolls back the account change",
        async () => {
          await db.execute(
            sql`ALTER TABLE admin_audit ADD CONSTRAINT admin_fixture_reject CHECK (reason <> 'Audit failure fixture')`,
          );
          try {
            await assert.rejects(
              owner.admin.setAccountStatus({
                userId: people[3]!.id,
                suspended: true,
                reason: "Audit failure fixture",
              }),
            );
            const detail = await owner.admin.user({ userId: people[3]!.id });
            assert.equal(
              detail.suspendedAt,
              null,
              "A change without its audit record must roll back",
            );
            assert.ok(await member.workspace.list());
          } finally {
            await db.execute(
              sql`ALTER TABLE admin_audit DROP CONSTRAINT admin_fixture_reject`,
            );
          }
        },
      );
      await t.test(
        "mutations have durable audit records with reasons and request IDs",
        async () => {
          const logs = await db
            .select()
            .from(schema.adminAudit)
            .where(eq(schema.adminAudit.requestId, prefix));
          for (const action of [
            "session.revoke",
            "premium.grant",
            "premium.revoke",
            "account.suspend",
            "account.reactivate",
            "job.retry",
          ])
            assert.ok(
              logs.some((l) => l.action === action),
              action,
            );
          assert.ok(logs.every((l) => l.reason.length >= 5 && l.actorId));
        },
      );
      await t.test(
        "overview, retention and workspace projections query real data",
        async () => {
          assert.ok((await owner.admin.overview({ days: 7 })).users >= 4);
          assert.equal(
            (await owner.admin.overview({ days: 7 })).days.length,
            7,
          );
          assert.ok(Array.isArray(await owner.admin.retention()));
          assert.equal(
            (await owner.admin.workspaces({ search: prefix })).rows[0]!
              .effectivePlan,
            "team",
          );
        },
      );
    } finally {
      for (const id of insertedJobs)
        await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
      await db
        .delete(schema.adminAudit)
        .where(eq(schema.adminAudit.requestId, prefix));
      await db.delete(schema.workspace).where(eq(schema.workspace.id, ws));
      for (const p of people)
        await db.delete(schema.user).where(eq(schema.user.id, p.id));
      if (authUserId)
        await db.delete(schema.user).where(eq(schema.user.id, authUserId));
      await closeDb();
    }
  },
);
