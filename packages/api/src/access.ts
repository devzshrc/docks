import { logError } from "./logger.js";
import { db, schema, type Role } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

/** Workspace scoping and permissions — every query goes through here (plan.md §10, M2). */

export type Action =
  | "billing.manage"
  | "members.manage"
  | "workspace.manage"
  | "workspace.delete"
  | "repos.manage"
  | "integrations.manage"
  | "review.act" // approve, request changes, comment, merge, assign, claim
  | "audit.read";

/** The whole permission model. Owners can do everything. */
export const CAN: Record<Action, readonly Role[]> = {
  "billing.manage": ["owner", "billing"],
  "members.manage": ["owner", "admin"],
  "workspace.manage": ["owner", "admin"],
  "workspace.delete": ["owner"],
  "repos.manage": ["owner", "admin"],
  "integrations.manage": ["owner", "admin"],
  "review.act": ["owner", "admin", "billing", "member"],
  "audit.read": ["owner", "admin"],
};

export const can = (role: Role, action: Action) => CAN[action].includes(role);

/**
 * Membership check. Also enforces the workspace's "require 2FA" setting, so
 * a member without 2FA can't use the workspace until they turn it on.
 */
export async function assertMember(userId: string, workspaceId: string) {
  const [member] = await db
    .select({
      role: schema.workspaceMember.role,
      repoIds: schema.workspaceMember.repoIds,
      require2fa: schema.workspace.require2fa,
      twoFactorEnabled: schema.user.twoFactorEnabled,
    })
    .from(schema.workspaceMember)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.workspaceMember.workspaceId))
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
    .where(
      and(
        eq(schema.workspaceMember.userId, userId),
        eq(schema.workspaceMember.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this workspace" });
  if (member.require2fa && !member.twoFactorEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This workspace requires two-factor authentication. Turn it on in Account settings.",
    });
  }
  return member;
}

export async function assertCan(userId: string, workspaceId: string, action: Action) {
  const member = await assertMember(userId, workspaceId);
  if (!can(member.role, action)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your role doesn't allow this" });
  }
  return member;
}

/** Can this member see this repo? Workspace restriction AND their own GitHub access. */
export async function canSeeRepo(userId: string, repoIds: number[] | null, repoId: number) {
  if (repoIds && !repoIds.includes(repoId)) return false;
  const [row] = await db
    .select({ repoId: schema.githubRepoAccess.repoId })
    .from(schema.githubRepoAccess)
    .where(and(eq(schema.githubRepoAccess.userId, userId), eq(schema.githubRepoAccess.repoId, repoId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Resolve "owner/name" to a repository the user can see: a member of the
 * owning workspace, allowed by their repo restriction, and visible to their
 * linked GitHub account.
 */
export async function repoForUser(userId: string, fullName: string) {
  const [repo] = await db
    .select({
      id: schema.repository.id,
      fullName: schema.repository.fullName,
      workspaceId: schema.githubInstallation.workspaceId,
    })
    .from(schema.repository)
    .innerJoin(
      schema.githubInstallation,
      eq(schema.githubInstallation.id, schema.repository.installationId),
    )
    .where(eq(schema.repository.fullName, fullName))
    .limit(1);
  const notFound = new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
  if (!repo) throw notFound;
  const member = await assertMember(userId, repo.workspaceId).catch(() => {
    throw notFound;
  });
  if (!(await canSeeRepo(userId, member.repoIds, repo.id))) throw notFound;
  return { id: repo.id, fullName: repo.fullName, workspaceId: repo.workspaceId, role: member.role };
}

/** Same as repoForUser, plus a permission check (e.g. viewers can't act). */
export async function repoForAction(userId: string, fullName: string, action: Action) {
  const repo = await repoForUser(userId, fullName);
  if (!can(repo.role, action)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your role doesn't allow this" });
  }
  return repo;
}

/** Append to the workspace audit log. Never blocks the action it records. */
export async function audit(
  workspaceId: string,
  actorId: string | null,
  action: string,
  target?: string | null,
  meta?: Record<string, unknown>,
) {
  try {
    await db.insert(schema.auditLog).values({ workspaceId, actorId, action, target: target ?? null, meta: meta ?? null });
  } catch (err) {
    logError("audit.failed", err);
  }
}

/** Enabled repos in the workspace this member can open (restriction AND GitHub access). */
export async function visibleRepos(userId: string, workspaceId: string, repoIds: number[] | null) {
  const [repos, access] = await Promise.all([
    db
      .select({ id: schema.repository.id, fullName: schema.repository.fullName })
      .from(schema.repository)
      .innerJoin(schema.githubInstallation, eq(schema.githubInstallation.id, schema.repository.installationId))
      .where(and(eq(schema.githubInstallation.workspaceId, workspaceId), eq(schema.repository.enabled, true))),
    db.select({ repoId: schema.githubRepoAccess.repoId }).from(schema.githubRepoAccess).where(eq(schema.githubRepoAccess.userId, userId)),
  ]);
  const onGithub = new Set(access.map((a) => a.repoId));
  return repos.filter((r) => onGithub.has(r.id) && (!repoIds || repoIds.includes(r.id)));
}
