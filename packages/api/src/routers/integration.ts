import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { healthDays } from "../health.js";
import { decrypt, encrypt } from "../crypto.js";
import { linearOrg, linearTeams } from "../linear.js";
import { z } from "zod";
import { assertCan, assertMember, audit, can } from "../access.js";
import { getInstallation, installUrl } from "../review/github.js";
import { authorizeUrl, githubAs, githubIdentity, syncUserRepos } from "../review/github-user.js";
import { linkInstallation } from "../review/sync.js";
import { isValidTimezone, sendTestDigest, slackConnectUrl } from "../slack.js";
import { protectedProcedure, router } from "../trpc.js";

export const integrationRouter = router({
  /** The setup callback re-checks membership, so the workspace id is safe as `state`. */
  githubInstallUrl: protectedProcedure
    .input(z.object({ workspaceId: z.string(), returnTo: z.enum(["onboarding"]).optional() }))
    .query(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
      // `<workspaceId>.onboarding` sends the person back to onboarding instead of Settings (ids are UUIDs, no dots).
      return { url: installUrl(input.returnTo ? `${input.workspaceId}.${input.returnTo}` : input.workspaceId) };
    }),
  /** Refresh which repos this person can open on GitHub now, instead of waiting for the background job. */
  syncMyAccess: protectedProcedure.mutation(async ({ ctx }) => {
    if (!(await githubIdentity(ctx.user.id))) return { ok: false };
    await syncUserRepos(ctx.user.id);
    return { ok: true };
  }),
  /**
   * Installations of our App this person can reach on GitHub. GitHub only redirects back after
   * a fresh install, so this is how an install that already exists gets linked to a workspace.
   */
  githubInstallations: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
      if (!(await githubIdentity(ctx.user.id))) return [];
      const [mine, linked] = await Promise.all([
        githubAs(ctx.user.id).installations(),
        db
          .select({ id: schema.githubInstallation.id })
          .from(schema.githubInstallation)
          .where(eq(schema.githubInstallation.workspaceId, input.workspaceId)),
      ]);
      const here = new Set(linked.map((r) => r.id));
      return Promise.all(
        mine.map(async ({ id }) => {
          const inst = await getInstallation(id);
          return { id, login: inst.account.login, type: inst.account.type, linked: here.has(id) };
        }),
      );
    }),
  linkGithubInstallation: protectedProcedure
    .input(z.object({ workspaceId: z.string(), installationId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
      // Only installations this person can actually see on GitHub.
      const mine = await githubAs(ctx.user.id).installations();
      if (!mine.some((i) => i.id === input.installationId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't have access to that installation on GitHub" });
      }
      await linkInstallation(ctx.user.id, input.installationId, input.workspaceId);
      return { ok: true };
    }),
  /** Per-user GitHub connection, needed to act as yourself (review, merge). */
  githubAccount: protectedProcedure.query(async ({ ctx }) => {
    let connectUrl: string | null = null;
    try {
      connectUrl = authorizeUrl(ctx.user.id);
    } catch (err) {
      console.error(`[github] user authorization not configured: ${(err as Error).message}`);
    }
    return { login: (await githubIdentity(ctx.user.id))?.login ?? null, connectUrl };
  }),
  /** Slack connection for the workspace (plan.md §5.4). */
  slack: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const member = await assertMember(ctx.user.id, input.workspaceId);
      const [row] = await db
        .select({
          teamName: schema.slackIntegration.teamName,
          channelName: schema.slackIntegration.channelName,
          digestHour: schema.slackIntegration.digestHour,
          timezone: schema.slackIntegration.timezone,
        })
        .from(schema.slackIntegration)
        .where(eq(schema.slackIntegration.workspaceId, input.workspaceId))
        .limit(1);
      let connectUrl: string | null = null;
      if (can(member.role, "integrations.manage")) {
        try {
          connectUrl = slackConnectUrl(ctx.user.id, input.workspaceId);
        } catch (err) {
          console.error(`[slack] not configured: ${(err as Error).message}`);
        }
      }
      return { connection: row ?? null, connectUrl, canManage: can(member.role, "integrations.manage") };
    }),

  /**
   * Sync health per repository for the last 90 days, from the job queue: which days jobs ran, and how many failed.
   * Powers the Status Bars on the Integrations page.
   */
  syncHealth: protectedProcedure.input(z.object({ workspaceId: z.string() })).query(async ({ ctx, input }) => {
    await assertMember(ctx.user.id, input.workspaceId);
    const repos = await db
      .select({ id: schema.repository.id, fullName: schema.repository.fullName })
      .from(schema.repository)
      .innerJoin(schema.githubInstallation, eq(schema.githubInstallation.id, schema.repository.installationId))
      .where(eq(schema.githubInstallation.workspaceId, input.workspaceId));
    if (!repos.length) return [];
    const rows = await db.execute<{ repo: string; day: string; done: number; failed: number }>(sql`
      SELECT payload->>'repoId' AS repo,
             to_char(date_trunc('day', updated_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
             count(*) FILTER (WHERE status = 'done')::int AS done,
             count(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM ${schema.jobs}
      WHERE type IN ('sync_repo', 'sync_pr', 'auto_assign', 'apply_rules')
        AND status IN ('done', 'failed')
        AND updated_at > now() - interval '90 days'
        AND payload->>'repoId' IN (${sql.join(repos.map((r) => sql`${String(r.id)}`), sql`, `)})
      GROUP BY 1, 2`);
    const now = new Date();
    return repos.map((r) => ({
      repo: r.fullName,
      days: healthDays(
        rows.rows.filter((x) => x.repo === String(r.id)).map((x) => ({ date: x.day, done: x.done, failed: x.failed })),
        now,
      ),
    }));
  }),

  /** Linear connection: lets the review page show linked Linear issues. The key is never sent back. */
  linear: protectedProcedure.input(z.object({ workspaceId: z.string() })).query(async ({ ctx, input }) => {
    const member = await assertMember(ctx.user.id, input.workspaceId);
    const [row] = await db
      .select({ orgName: schema.linearIntegration.orgName, teamName: schema.linearIntegration.defaultTeamName, teamId: schema.linearIntegration.defaultTeamId })
      .from(schema.linearIntegration)
      .where(eq(schema.linearIntegration.workspaceId, input.workspaceId));
    return { orgName: row?.orgName ?? null, teamId: row?.teamId ?? null, teamName: row?.teamName ?? null, canManage: can(member.role, "integrations.manage") };
  }),

  /** Teams to choose from when filing Linear issues from "New issue". */
  linearTeams: protectedProcedure.input(z.object({ workspaceId: z.string() })).query(async ({ ctx, input }) => {
    await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
    const [row] = await db.select({ key: schema.linearIntegration.apiKeyEncrypted }).from(schema.linearIntegration).where(eq(schema.linearIntegration.workspaceId, input.workspaceId));
    if (!row) return [];
    return linearTeams(decrypt(row.key)).catch(() => []);
  }),

  setLinearTeam: protectedProcedure
    .input(z.object({ workspaceId: z.string(), teamId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
      const [row] = await db.select({ key: schema.linearIntegration.apiKeyEncrypted }).from(schema.linearIntegration).where(eq(schema.linearIntegration.workspaceId, input.workspaceId));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Connect Linear first" });
      const team = input.teamId ? (await linearTeams(decrypt(row.key)).catch(() => [])).find((t) => t.id === input.teamId) : null;
      if (input.teamId && !team) throw new TRPCError({ code: "BAD_REQUEST", message: "That Linear team wasn't found" });
      await db
        .update(schema.linearIntegration)
        .set({ defaultTeamId: team?.id ?? null, defaultTeamName: team?.name ?? null })
        .where(eq(schema.linearIntegration.workspaceId, input.workspaceId));
      await audit(input.workspaceId, ctx.user.id, "linear.team", team?.name ?? null);
    }),

  connectLinear: protectedProcedure
    .input(z.object({ workspaceId: z.string(), apiKey: z.string().trim().min(10).max(200) }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
      let orgName: string;
      try {
        orgName = await linearOrg(input.apiKey);
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (err as Error).message });
      }
      const values = { workspaceId: input.workspaceId, apiKeyEncrypted: encrypt(input.apiKey), orgName };
      await db
        .insert(schema.linearIntegration)
        .values(values)
        .onConflictDoUpdate({ target: schema.linearIntegration.workspaceId, set: values });
      await audit(input.workspaceId, ctx.user.id, "linear.connect", orgName);
      return { orgName };
    }),

  disconnectLinear: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
      await db.delete(schema.linearIntegration).where(eq(schema.linearIntegration.workspaceId, input.workspaceId));
      await audit(input.workspaceId, ctx.user.id, "linear.disconnect", null);
    }),

  setDigest: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        hour: z.number().int().min(0).max(23),
        timezone: z.string().refine(isValidTimezone, "Unknown timezone"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
      await audit(input.workspaceId, ctx.user.id, "slack.digest", null, { hour: input.hour, timezone: input.timezone });
      const updated = await db
        .update(schema.slackIntegration)
        .set({ digestHour: input.hour, timezone: input.timezone })
        .where(eq(schema.slackIntegration.workspaceId, input.workspaceId))
        .returning({ workspaceId: schema.slackIntegration.workspaceId });
      if (!updated.length) throw new TRPCError({ code: "NOT_FOUND", message: "Connect Slack first" });
    }),

  sendTestDigest: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
      try {
        await sendTestDigest(input.workspaceId);
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (err as Error).message });
      }
    }),

  disconnectSlack: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
      await audit(input.workspaceId, ctx.user.id, "slack.disconnect");
      await db
        .delete(schema.slackIntegration)
        .where(eq(schema.slackIntegration.workspaceId, input.workspaceId));
    }),
});
