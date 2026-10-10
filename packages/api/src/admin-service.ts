import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import {
  assertAdminWrite,
  platformRole,
  RETRYABLE_JOBS,
} from "./admin-policy.js";
import type { Context } from "./context.js";

/** The audit insert and change commit together; audit failure rolls the change back. */
export async function adminChange(
  ctx: Context & { user: NonNullable<Context["user"]> },
  action: string,
  target: string,
  reason: string,
  change: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => Promise<Record<string, unknown>>,
  ownerOnly = false,
) {
  const role = platformRole(ctx.user.email);
  if (!role) throw new TRPCError({ code: "NOT_FOUND" });
  assertAdminWrite(role, ctx.sessionCreatedAt, ownerOnly);
  return db.transaction(async (tx) => {
    const meta = await change(tx);
    await tx
      .insert(schema.adminAudit)
      .values({
        actorId: ctx.user.id,
        action,
        target,
        reason,
        requestId: ctx.requestId,
        meta,
      });
    return { ok: true as const };
  });
}
export async function setAccountStatus(
  ctx: Context & { user: NonNullable<Context["user"]> },
  input: { userId: string; suspended: boolean; reason: string },
) {
  return adminChange(
    ctx,
    input.suspended ? "account.suspend" : "account.reactivate",
    input.userId,
    input.reason,
    async (tx) => {
      const [user] = await tx
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, input.userId))
        .for("update");
      if (!user)
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      // Platform owners are managed through deployment configuration, not this UI.
      if (input.suspended && platformRole(user.email) === "owner")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Platform owners cannot be suspended here.",
        });
      await tx
        .insert(schema.accountControl)
        .values({
          userId: user.id,
          suspendedAt: input.suspended ? new Date() : null,
          reason: input.reason,
          updatedBy: ctx.user.id,
        })
        .onConflictDoUpdate({
          target: schema.accountControl.userId,
          set: {
            suspendedAt: input.suspended ? new Date() : null,
            reason: input.reason,
            updatedBy: ctx.user.id,
          },
        });
      if (input.suspended)
        await tx
          .delete(schema.session)
          .where(eq(schema.session.userId, user.id));
      return { suspended: input.suspended };
    },
    true,
  );
}
export async function revokeSessions(
  ctx: Context & { user: NonNullable<Context["user"]> },
  input: { userId: string; sessionId?: string; reason: string },
) {
  return adminChange(
    ctx,
    "session.revoke",
    input.userId,
    input.reason,
    async (tx) => {
      const [user] = await tx
        .select({ email: schema.user.email })
        .from(schema.user)
        .where(eq(schema.user.id, input.userId))
        .for("update");
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      if (platformRole(ctx.user.email) !== "owner" && platformRole(user.email))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners can revoke administrator sessions.",
        });
      const removed = await tx
        .delete(schema.session)
        .where(
          and(
            eq(schema.session.userId, input.userId),
            input.sessionId
              ? eq(schema.session.id, input.sessionId)
              : undefined,
          ),
        )
        .returning({ id: schema.session.id });
      if (input.sessionId && !removed.length)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found for this user",
        });
      return { revoked: removed.length };
    },
  );
}
export async function grantPremium(
  ctx: Context & { user: NonNullable<Context["user"]> },
  input: { workspaceId: string; reason: string; expiresAt: Date | null },
) {
  if (input.expiresAt && input.expiresAt <= new Date())
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Expiry must be in the future.",
    });
  return adminChange(
    ctx,
    "premium.grant",
    input.workspaceId,
    input.reason,
    async (tx) => {
      const [ws] = await tx
        .select({ id: schema.workspace.id })
        .from(schema.workspace)
        .where(eq(schema.workspace.id, input.workspaceId))
        .for("update");
      if (!ws) throw new TRPCError({ code: "NOT_FOUND" });
      await tx
        .update(schema.premiumGrant)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.premiumGrant.workspaceId, ws.id),
            isNull(schema.premiumGrant.revokedAt),
          ),
        );
      const [grant] = await tx
        .insert(schema.premiumGrant)
        .values({
          workspaceId: ws.id,
          createdBy: ctx.user.id,
          reason: input.reason,
          expiresAt: input.expiresAt,
        })
        .returning();
      return {
        grantId: grant!.id,
        expiresAt: input.expiresAt?.toISOString() ?? null,
      };
    },
    true,
  );
}
export async function revokePremium(
  ctx: Context & { user: NonNullable<Context["user"]> },
  input: { workspaceId: string; reason: string },
) {
  return adminChange(
    ctx,
    "premium.revoke",
    input.workspaceId,
    input.reason,
    async (tx) => {
      const [ws] = await tx
        .select({ id: schema.workspace.id })
        .from(schema.workspace)
        .where(eq(schema.workspace.id, input.workspaceId))
        .for("update");
      if (!ws) throw new TRPCError({ code: "NOT_FOUND" });
      const changed = await tx
        .update(schema.premiumGrant)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.premiumGrant.workspaceId, input.workspaceId),
            isNull(schema.premiumGrant.revokedAt),
          ),
        )
        .returning({ id: schema.premiumGrant.id });
      return { grants: changed.length };
    },
    true,
  );
}
export async function retryJob(
  ctx: Context & { user: NonNullable<Context["user"]> },
  input: { jobId: number; reason: string },
) {
  return adminChange(
    ctx,
    "job.retry",
    String(input.jobId),
    input.reason,
    async (tx) => {
      const [job] = await tx
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, input.jobId))
        .for("update");
      if (!job || job.status !== "failed")
        throw new TRPCError({
          code: "CONFLICT",
          message: "Only failed jobs can be retried.",
        });
      if (!(RETRYABLE_JOBS as readonly string[]).includes(job.type))
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This job can send messages or change remote state and cannot be retried here.",
        });
      await tx
        .update(schema.jobs)
        .set({
          status: "queued",
          attempts: 0,
          lastError: null,
          runAfter: new Date(),
        })
        .where(eq(schema.jobs.id, input.jobId));
      return { type: job.type };
    },
  );
}
