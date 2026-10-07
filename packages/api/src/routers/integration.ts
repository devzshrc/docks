import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { encrypt } from "../crypto.js";
import { linearOrg } from "../linear.js";
import { z } from "zod";
import { assertCan, assertMember, audit, can } from "../access.js";
import { installUrl } from "../review/github.js";
import { authorizeUrl, githubIdentity } from "../review/github-user.js";
import { isValidTimezone, sendTestDigest, slackConnectUrl } from "../slack.js";
import { protectedProcedure, router } from "../trpc.js";

export const integrationRouter = router({
  /** The setup callback re-checks membership, so the workspace id is safe as `state`. */
  githubInstallUrl: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
      return { url: installUrl(input.workspaceId) };
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

  /** Linear connection: lets the review page show linked Linear issues. The key is never sent back. */
  linear: protectedProcedure.input(z.object({ workspaceId: z.string() })).query(async ({ ctx, input }) => {
    const member = await assertMember(ctx.user.id, input.workspaceId);
    const [row] = await db
      .select({ orgName: schema.linearIntegration.orgName })
      .from(schema.linearIntegration)
      .where(eq(schema.linearIntegration.workspaceId, input.workspaceId));
    return { orgName: row?.orgName ?? null, canManage: can(member.role, "integrations.manage") };
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
