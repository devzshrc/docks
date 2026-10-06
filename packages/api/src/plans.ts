import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";

/** plan.md §11 — free tier limits. Team is unlimited and billed per seat. */
export const PLAN_LIMITS = {
  free: { members: 5, repos: 3 },
  team: { members: Infinity, repos: Infinity },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;

export async function workspacePlan(workspaceId: string): Promise<Plan> {
  const [row] = await db
    .select({ plan: schema.workspace.plan })
    .from(schema.workspace)
    .where(eq(schema.workspace.id, workspaceId))
    .limit(1);
  return row?.plan ?? "free";
}

export async function memberCount(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.workspaceMember)
    .where(eq(schema.workspaceMember.workspaceId, workspaceId));
  return row?.n ?? 0;
}

export async function enabledRepoCount(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.repository)
    .innerJoin(
      schema.githubInstallation,
      eq(schema.githubInstallation.id, schema.repository.installationId),
    )
    .where(
      and(
        eq(schema.githubInstallation.workspaceId, workspaceId),
        eq(schema.repository.enabled, true),
      ),
    );
  return row?.n ?? 0;
}

export async function assertCanAddMember(workspaceId: string) {
  const limit = PLAN_LIMITS[await workspacePlan(workspaceId)].members;
  if ((await memberCount(workspaceId)) >= limit) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `The free plan includes up to ${limit} people. Upgrade to add more.`,
    });
  }
}

export async function assertCanEnableRepo(workspaceId: string) {
  const limit = PLAN_LIMITS[await workspacePlan(workspaceId)].repos;
  if ((await enabledRepoCount(workspaceId)) >= limit) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `The free plan includes up to ${limit} repositories. Upgrade or turn another one off.`,
    });
  }
}
