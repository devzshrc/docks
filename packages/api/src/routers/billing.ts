import { z } from "zod";
import { assertCan, assertMember, audit, can } from "../access.js";
import { checkoutUrl, portalUrl } from "../billing.js";
import { db, schema } from "@docks/db";
import { eq } from "drizzle-orm";
import { enabledRepoCount, memberCount, PLAN_LIMITS, workspacePlan } from "../plans.js";
import { protectedProcedure, router } from "../trpc.js";

const workspaceInput = z.object({ workspaceId: z.string() });

const finite = (n: number) => (Number.isFinite(n) ? n : null);

export const billingRouter = router({
  status: protectedProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
    const member = await assertMember(ctx.user.id, input.workspaceId);
    const [ws] = await db
      .select({
        plan: schema.workspace.plan,
        status: schema.workspace.subscriptionStatus,
        currentPeriodEnd: schema.workspace.currentPeriodEnd,
        hasCustomer: schema.workspace.billingCustomerId,
      })
      .from(schema.workspace)
      .where(eq(schema.workspace.id, input.workspaceId))
      .limit(1);
    const plan = await workspacePlan(input.workspaceId);
    return {
      plan,
      paidPlan: ws?.plan ?? "free",
      complimentary: plan === "team" && ws?.plan !== "team",
      status: ws?.status ?? null,
      currentPeriodEnd: ws?.currentPeriodEnd ?? null,
      hasBillingAccount: Boolean(ws?.hasCustomer),
      canManage: can(member.role, "billing.manage"),
      usage: {
        members: await memberCount(input.workspaceId),
        repos: await enabledRepoCount(input.workspaceId),
      },
      limits: {
        members: finite(PLAN_LIMITS[plan].members),
        repos: finite(PLAN_LIMITS[plan].repos),
      },
    };
  }),

  checkoutUrl: protectedProcedure.input(workspaceInput).mutation(async ({ ctx, input }) => {
    await assertCan(ctx.user.id, input.workspaceId, "billing.manage");
    await audit(input.workspaceId, ctx.user.id, "billing.checkout");
    return { url: await checkoutUrl(input.workspaceId, ctx.user.email, ctx.user.name) };
  }),

  portalUrl: protectedProcedure.input(workspaceInput).mutation(async ({ ctx, input }) => {
    await assertCan(ctx.user.id, input.workspaceId, "billing.manage");
    return { url: await portalUrl(input.workspaceId) };
  }),
});
