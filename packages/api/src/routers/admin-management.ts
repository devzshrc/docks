import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import {
  and,
  count,
  desc,
  getTableColumns,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { operationalHealth } from "../operational-health.js";
import { protectedProcedure } from "../trpc.js";
import {
  assertAdminAccess,
  deviceLabel,
  effectivePlan,
  platformRole,
  RETRYABLE_JOBS,
} from "../admin-policy.js";
import {
  grantPremium,
  retryJob,
  revokePremium,
  revokeSessions,
  setAccountStatus,
} from "../admin-service.js";

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const role = platformRole(ctx.user.email);
  const [user] = await db
    .select({ twoFactorEnabled: schema.user.twoFactorEnabled })
    .from(schema.user)
    .where(eq(schema.user.id, ctx.user.id))
    .limit(1);
  assertAdminAccess(
    { ...ctx.user, twoFactorEnabled: user?.twoFactorEnabled ?? false },
    role,
  );
  return next({ ctx: { ...ctx, adminRole: role! } });
});
const page = z.object({
  search: z.string().max(200).default(""),
  offset: z.number().int().min(0).max(100000).default(0),
  limit: z.number().int().min(1).max(100).default(25),
});
const reason = z.string().trim().min(5).max(1000);
const period = z.object({ days: z.number().int().min(7).max(90).default(30) });
const userFields = {
  id: schema.user.id,
  name: schema.user.name,
  email: schema.user.email,
  image: schema.user.image,
  emailVerified: schema.user.emailVerified,
  twoFactorEnabled: schema.user.twoFactorEnabled,
  createdAt: schema.user.createdAt,
  suspendedAt: schema.accountControl.suspendedAt,
  suspensionReason: schema.accountControl.reason,
};

export const managementProcedures = {
  access: adminProcedure.query(({ ctx }) => ({
    role: ctx.adminRole,
    email: ctx.user.email,
    freshUntil: ctx.sessionCreatedAt
      ? new Date(ctx.sessionCreatedAt.getTime() + 30 * 60000)
      : null,
  })),
  users: adminProcedure
    .input(
      page.extend({
        status: z.enum(["all", "active", "suspended"]).default("all"),
      }),
    )
    .query(async ({ input }) => {
      const where = and(
        input.search
          ? or(
              ilike(schema.user.email, `%${input.search}%`),
              ilike(schema.user.name, `%${input.search}%`),
            )
          : undefined,
        input.status === "suspended"
          ? isNotNull(schema.accountControl.suspendedAt)
          : input.status === "active"
            ? isNull(schema.accountControl.suspendedAt)
            : undefined,
      );
      const [rows, totals] = await Promise.all([
        db
          .select({
            ...userFields,
            lastActiveAt: sql<Date | null>`(select max(at) from event where user_id = "user"."id")`,
          })
          .from(schema.user)
          .leftJoin(
            schema.accountControl,
            eq(schema.accountControl.userId, schema.user.id),
          )
          .where(where)
          .orderBy(desc(schema.user.createdAt), schema.user.id)
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ n: count() })
          .from(schema.user)
          .leftJoin(
            schema.accountControl,
            eq(schema.accountControl.userId, schema.user.id),
          )
          .where(where),
      ]);
      return { rows, total: totals[0]!.n };
    }),
  user: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const [user] = await db
        .select(userFields)
        .from(schema.user)
        .leftJoin(
          schema.accountControl,
          eq(schema.accountControl.userId, schema.user.id),
        )
        .where(eq(schema.user.id, input.userId));
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const [sessions, memberships, providers, events, logins] =
        await Promise.all([
          db
            .select({
              id: schema.session.id,
              createdAt: schema.session.createdAt,
              updatedAt: schema.session.updatedAt,
              expiresAt: schema.session.expiresAt,
              userAgent: schema.session.userAgent,
              ipAddress: schema.session.ipAddress,
            })
            .from(schema.session)
            .where(
              and(
                eq(schema.session.userId, input.userId),
                gt(schema.session.expiresAt, new Date()),
              ),
            )
            .orderBy(desc(schema.session.updatedAt)),
          db
            .select({
              id: schema.workspace.id,
              name: schema.workspace.name,
              role: schema.workspaceMember.role,
            })
            .from(schema.workspaceMember)
            .innerJoin(
              schema.workspace,
              eq(schema.workspace.id, schema.workspaceMember.workspaceId),
            )
            .where(eq(schema.workspaceMember.userId, input.userId)),
          db
            .select({ provider: schema.account.providerId })
            .from(schema.account)
            .where(eq(schema.account.userId, input.userId)),
          db
            .select({ name: schema.event.name, at: schema.event.at })
            .from(schema.event)
            .where(eq(schema.event.userId, input.userId))
            .orderBy(desc(schema.event.at))
            .limit(30),
          db
            .select()
            .from(schema.authEvent)
            .where(eq(schema.authEvent.userId, input.userId))
            .orderBy(desc(schema.authEvent.at))
            .limit(20),
        ]);
      return {
        ...user,
        sessions: sessions.map(({ userAgent, ...s }) => ({
          ...s,
          device: deviceLabel(userAgent),
        })),
        memberships,
        providers,
        events,
        logins,
      };
    }),
  workspaces: adminProcedure.input(page).query(async ({ input }) => {
    const where = input.search
      ? or(
          ilike(schema.workspace.name, `%${input.search}%`),
          ilike(schema.workspace.slug, `%${input.search}%`),
        )
      : undefined;
    const [rows, totals] = await Promise.all([
      db
        .select({
          id: schema.workspace.id,
          name: schema.workspace.name,
          slug: schema.workspace.slug,
          paidPlan: schema.workspace.plan,
          subscriptionStatus: schema.workspace.subscriptionStatus,
          createdAt: schema.workspace.createdAt,
          members: sql<number>`(select count(*)::int from workspace_member where workspace_id = "workspace"."id")`,
        })
        .from(schema.workspace)
        .where(where)
        .orderBy(desc(schema.workspace.createdAt), schema.workspace.id)
        .limit(input.limit)
        .offset(input.offset),
      db.select({ n: count() }).from(schema.workspace).where(where),
    ]);
    const grants = rows.length
      ? await db
          .select()
          .from(schema.premiumGrant)
          .where(
            inArray(
              schema.premiumGrant.workspaceId,
              rows.map((w) => w.id),
            ),
          )
      : [];
    return {
      rows: rows.map((w) => ({
        ...w,
        effectivePlan: effectivePlan(
          w.paidPlan,
          grants.filter((g) => g.workspaceId === w.id),
        ),
      })),
      total: totals[0]!.n,
    };
  }),
  workspace: adminProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ input }) => {
      const [w] = await db
        .select()
        .from(schema.workspace)
        .where(eq(schema.workspace.id, input.workspaceId));
      if (!w) throw new TRPCError({ code: "NOT_FOUND" });
      const [members, grants, repositories, slack, linear] = await Promise.all([
        db
          .select({
            id: schema.user.id,
            name: schema.user.name,
            email: schema.user.email,
            role: schema.workspaceMember.role,
          })
          .from(schema.workspaceMember)
          .innerJoin(
            schema.user,
            eq(schema.user.id, schema.workspaceMember.userId),
          )
          .where(eq(schema.workspaceMember.workspaceId, w.id)),
        db
          .select()
          .from(schema.premiumGrant)
          .where(eq(schema.premiumGrant.workspaceId, w.id))
          .orderBy(desc(schema.premiumGrant.startsAt)),
        db
          .select({
            id: schema.repository.id,
            name: schema.repository.fullName,
            enabled: schema.repository.enabled,
            updatedAt: schema.repository.updatedAt,
            suspendedAt: schema.githubInstallation.suspendedAt,
          })
          .from(schema.repository)
          .innerJoin(
            schema.githubInstallation,
            eq(schema.githubInstallation.id, schema.repository.installationId),
          )
          .where(eq(schema.githubInstallation.workspaceId, w.id)),
        db
          .select({
            name: schema.slackIntegration.teamName,
            channel: schema.slackIntegration.channelName,
          })
          .from(schema.slackIntegration)
          .where(eq(schema.slackIntegration.workspaceId, w.id)),
        db
          .select({ name: schema.linearIntegration.orgName })
          .from(schema.linearIntegration)
          .where(eq(schema.linearIntegration.workspaceId, w.id)),
      ]);
      return {
        ...w,
        effectivePlan: effectivePlan(w.plan, grants),
        members,
        grants,
        repositories,
        slack,
        linear,
      };
    }),
  overview: adminProcedure.input(period).query(async ({ input }) => {
    const now = new Date();
    const since = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - input.days + 1,
      ),
    );
    const previous = new Date(since.getTime() - input.days * 86400000);
    const [
      users,
      workspaces,
      signups,
      previousSignups,
      active,
      previousActive,
      logins,
      daily,
      features,
      funnel,
    ] = await Promise.all([
      db.select({ n: count() }).from(schema.user),
      db.select({ n: count() }).from(schema.workspace),
      db
        .select({ n: count() })
        .from(schema.user)
        .where(gte(schema.user.createdAt, since)),
      db
        .select({ n: count() })
        .from(schema.user)
        .where(
          and(
            gte(schema.user.createdAt, previous),
            lt(schema.user.createdAt, since),
          ),
        ),
      db
        .select({ n: sql<number>`count(distinct ${schema.event.userId})::int` })
        .from(schema.event)
        .where(
          and(
            gte(schema.event.at, since),
            inArray(schema.event.name, [
              "pr_opened",
              "review_submitted",
              "issue_created",
            ]),
          ),
        ),
      db
        .select({ n: sql<number>`count(distinct ${schema.event.userId})::int` })
        .from(schema.event)
        .where(
          and(
            gte(schema.event.at, previous),
            lt(schema.event.at, since),
            inArray(schema.event.name, [
              "pr_opened",
              "review_submitted",
              "issue_created",
            ]),
          ),
        ),
      db
        .select({ kind: schema.authEvent.kind, n: count() })
        .from(schema.authEvent)
        .where(gte(schema.authEvent.at, since))
        .groupBy(schema.authEvent.kind),
      db
        .select({
          day: sql<string>`to_char(${schema.user.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
          n: count(),
        })
        .from(schema.user)
        .where(gte(schema.user.createdAt, since))
        .groupBy(
          sql`to_char(${schema.user.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        )
        .orderBy(
          sql`to_char(${schema.user.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        ),
      db
        .select({
          name: schema.event.name,
          n: count(),
          users: sql<number>`count(distinct ${schema.event.userId})::int`,
        })
        .from(schema.event)
        .where(gte(schema.event.at, since))
        .groupBy(schema.event.name)
        .orderBy(desc(count())),
      db
        .select({
          id: schema.user.id,
          createdAt: schema.user.createdAt,
          workspaceAt: sql<Date | null>`(select min(at) from event where user_id = "user"."id" and name = 'workspace_created')`,
          githubAt: sql<Date | null>`(select min(at) from event where user_id = "user"."id" and name in ('github_installed','github_connected'))`,
          reviewAt: sql<Date | null>`(select min(at) from event where user_id = "user"."id" and name = 'review_submitted')`,
        })
        .from(schema.user)
        .where(gte(schema.user.createdAt, since)),
    ]);
    const dayMap = new Map(daily.map((d) => [d.day, d.n]));
    const days = Array.from({ length: input.days }, (_, i) => {
      const day = new Date(now.getTime() - (input.days - 1 - i) * 86400000)
        .toISOString()
        .slice(0, 10);
      return { day, n: dayMap.get(day) ?? 0 };
    });
    const after = (a: Date | null, b: Date) => a && new Date(a) >= b;
    return {
      users: users[0]!.n,
      workspaces: workspaces[0]!.n,
      signups: signups[0]!.n,
      previousSignups: previousSignups[0]!.n,
      active: active[0]!.n,
      previousActive: previousActive[0]!.n,
      logins,
      days,
      features,
      funnel: [
        funnel.length,
        funnel.filter((u) => after(u.workspaceAt, u.createdAt)).length,
        funnel.filter(
          (u) =>
            after(u.workspaceAt, u.createdAt) &&
            u.githubAt &&
            u.workspaceAt &&
            new Date(u.githubAt) >= new Date(u.workspaceAt),
        ).length,
        funnel.filter(
          (u) =>
            u.workspaceAt &&
            u.githubAt &&
            u.reviewAt &&
            after(u.workspaceAt, u.createdAt) &&
            new Date(u.githubAt) >= new Date(u.workspaceAt) &&
            new Date(u.reviewAt) >= new Date(u.githubAt),
        ).length,
      ],
      since,
    };
  }),
  retention: adminProcedure.query(async () => {
    const rows = await db.execute<{
      cohort: string;
      users: number;
      returning: number;
    }>(
      sql`WITH cohorts AS (SELECT user_id, min(at) AS activated_at FROM event WHERE name = 'review_submitted' AND user_id IS NOT NULL GROUP BY user_id) SELECT to_char(date_trunc('week', activated_at), 'YYYY-MM-DD') AS cohort, count(*)::int AS users, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM event e WHERE e.user_id = c.user_id AND e.name IN ('pr_opened', 'review_submitted', 'issue_created') AND e.at >= c.activated_at + interval '7 days' AND e.at < c.activated_at + interval '14 days'))::int AS returning FROM cohorts c WHERE activated_at >= now() - interval '90 days' AND activated_at < now() - interval '14 days' GROUP BY 1 ORDER BY 1 DESC`,
    );
    return rows.rows;
  }),
  audit: adminProcedure.input(page).query(async ({ input }) => {
    const where = input.search
      ? or(
          ilike(schema.adminAudit.action, `%${input.search}%`),
          ilike(schema.adminAudit.target, `%${input.search}%`),
        )
      : undefined;
    const [rows, total] = await Promise.all([
      db
        .select({
          ...getTableColumns(schema.adminAudit),
          actorName: schema.user.name,
          actorEmail: schema.user.email,
        })
        .from(schema.adminAudit)
        .leftJoin(schema.user, eq(schema.user.id, schema.adminAudit.actorId))
        .where(where)
        .orderBy(desc(schema.adminAudit.at), schema.adminAudit.id)
        .limit(input.limit)
        .offset(input.offset),
      db.select({ n: count() }).from(schema.adminAudit).where(where),
    ]);
    return { rows, total: total[0]!.n };
  }),
  health: adminProcedure.input(page).query(async ({ input }) => {
    const where = eq(schema.jobs.status, "failed");
    const [rows, totals, statuses, operational] = await Promise.all([
      db
        .select({
          id: schema.jobs.id,
          type: schema.jobs.type,
          status: schema.jobs.status,
          attempts: schema.jobs.attempts,
          updatedAt: schema.jobs.updatedAt,
        })
        .from(schema.jobs)
        .where(where)
        .orderBy(desc(schema.jobs.updatedAt))
        .limit(input.limit)
        .offset(input.offset),
      db.select({ n: count() }).from(schema.jobs).where(where),
      db
        .select({ status: schema.jobs.status, n: count() })
        .from(schema.jobs)
        .groupBy(schema.jobs.status),
      operationalHealth(),
    ]);
    // Payloads and raw error strings can contain credentials; never return them.
    return {
      rows: rows.map((r) => ({
        ...r,
        retryable: (RETRYABLE_JOBS as readonly string[]).includes(r.type),
      })),
      total: totals[0]!.n,
      statuses,
      ...operational,
    };
  }),
  errors: adminProcedure.input(page).query(async ({ input }) => {
    // The only procedure that returns full stack text; every other
    // procedure withholds raw errors to protect credentials.
    const where = input.search
      ? or(
          ilike(schema.serverError.message, `%${input.search}%`),
          ilike(schema.serverError.hash, `%${input.search}%`),
        )
      : undefined;
    const [rows, totals] = await Promise.all([
      db
        .select()
        .from(schema.serverError)
        .where(where)
        .orderBy(desc(schema.serverError.lastAt), schema.serverError.hash)
        .limit(input.limit)
        .offset(input.offset),
      db.select({ n: count() }).from(schema.serverError).where(where),
    ]);
    return { rows, total: totals[0]!.n };
  }),
  webhooks: adminProcedure
    .input(
      page.extend({
        installationId: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER)
          .optional(),
        result: z.enum(["all", ...schema.WEBHOOK_RESULTS]).default("all"),
      }),
    )
    .query(async ({ input }) => {
      // Numeric search also matches the installation id; text matches the
      // event name, the GitHub delivery id, and the failure reason.
      // Delivery ids, reasons, and events never hold payloads, so all are
      // safe to return and search.
      const numericSearch = /^\d+$/.test(input.search.trim())
        ? Number(input.search.trim())
        : null;
      const where = and(
        input.search
          ? or(
              ilike(schema.webhookDelivery.event, `%${input.search}%`),
              ilike(schema.webhookDelivery.deliveryId, `%${input.search}%`),
              ilike(schema.webhookDelivery.reason, `%${input.search}%`),
              numericSearch !== null && Number.isSafeInteger(numericSearch)
                ? eq(schema.webhookDelivery.installationId, numericSearch)
                : undefined,
            )
          : undefined,
        input.installationId !== undefined
          ? eq(schema.webhookDelivery.installationId, input.installationId)
          : undefined,
        input.result !== "all"
          ? eq(schema.webhookDelivery.result, input.result)
          : undefined,
      );
      const since24h = new Date(Date.now() - 24 * 3600000);
      const [rows, totals, recent] = await Promise.all([
        db
          .select()
          .from(schema.webhookDelivery)
          .where(where)
          .orderBy(
            desc(schema.webhookDelivery.receivedAt),
            schema.webhookDelivery.id,
          )
          .limit(input.limit)
          .offset(input.offset),
        db.select({ n: count() }).from(schema.webhookDelivery).where(where),
        db
          .select({ result: schema.webhookDelivery.result, n: count() })
          .from(schema.webhookDelivery)
          .where(gte(schema.webhookDelivery.receivedAt, since24h))
          .groupBy(schema.webhookDelivery.result),
      ]);
      // Anything that is not `ok` (handler failures and signature rejects)
      // counts as failed for the Health panel rate.
      const total24h = recent.reduce((sum, r) => sum + r.n, 0);
      const failed24h = recent
        .filter((r) => r.result !== "ok")
        .reduce((sum, r) => sum + r.n, 0);
      return {
        rows,
        total: totals[0]!.n,
        last24h: {
          total: total24h,
          failed: failed24h,
          rate: total24h ? failed24h / total24h : 0,
        },
      };
    }),
  setAccountStatus: adminProcedure
    .input(z.object({ userId: z.string(), suspended: z.boolean(), reason }))
    .mutation(({ ctx, input }) => setAccountStatus(ctx, input)),
  revokeSessions: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        sessionId: z.string().optional(),
        reason,
      }),
    )
    .mutation(({ ctx, input }) => revokeSessions(ctx, input)),
  grantPremium: adminProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        expiresAt: z.date().nullable(),
        reason,
      }),
    )
    .mutation(({ ctx, input }) => grantPremium(ctx, input)),
  revokePremium: adminProcedure
    .input(z.object({ workspaceId: z.string(), reason }))
    .mutation(({ ctx, input }) => revokePremium(ctx, input)),
  retryJob: adminProcedure
    .input(z.object({ jobId: z.number().int().positive(), reason }))
    .mutation(({ ctx, input }) => retryJob(ctx, input)),
};
