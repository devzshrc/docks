import { db, ROLES, schema } from "@docks/db";
import { track } from "../analytics.js";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { assertCan, assertMember, audit, can, CAN, type Action } from "../access.js";
import { syncSeats } from "../billing.js";
import { actionEmail, sendEmail } from "../email.js";
import { enqueue } from "../jobs.js";
import { assertCanAddMember, assertCanEnableRepo } from "../plans.js";
import { protectedProcedure, router } from "../trpc.js";

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "workspace"}-${randomUUID().slice(0, 6)}`;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const clientUrl = () => process.env.CLIENT_URL ?? "http://localhost:3000";

/** Seat changes shouldn't fail the membership change; log and let billing catch up. */
async function updateSeats(workspaceId: string) {
  try {
    await syncSeats(workspaceId);
  } catch (err) {
    console.error(`[billing] seat sync for ${workspaceId} failed: ${(err as Error).message}`);
  }
}

/** Creates an invite and returns the only copy of its token (we keep the hash). */
async function newInvite(workspaceId: string, createdBy: string, email: string | null = null) {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await db.insert(schema.workspaceInvite).values({
    id: randomUUID(),
    workspaceId,
    tokenHash: hashToken(token),
    createdBy,
    expiresAt,
    email,
  });
  return { url: `${clientUrl()}/join/${token}`, expiresAt };
}

async function findInvite(token: string) {
  const [invite] = await db
    .select({
      id: schema.workspaceInvite.id,
      workspaceId: schema.workspaceInvite.workspaceId,
      workspaceName: schema.workspace.name,
      email: schema.workspaceInvite.email,
    })
    .from(schema.workspaceInvite)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.workspaceInvite.workspaceId))
    .where(
      and(
        eq(schema.workspaceInvite.tokenHash, hashToken(token)),
        isNull(schema.workspaceInvite.revokedAt),
        gt(schema.workspaceInvite.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!invite) {
    throw new TRPCError({ code: "NOT_FOUND", message: "This invite link is invalid or has expired" });
  }
  return invite;
}

export const workspaceRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db
      .select({
        id: schema.workspace.id,
        name: schema.workspace.name,
        slug: schema.workspace.slug,
        role: schema.workspaceMember.role,
      })
      .from(schema.workspaceMember)
      .innerJoin(schema.workspace, eq(schema.workspace.id, schema.workspaceMember.workspaceId))
      .where(eq(schema.workspaceMember.userId, ctx.user.id))
      .orderBy(asc(schema.workspace.createdAt)),
  ),

  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(schema.workspace).values({ id, name: input.name, slug: slugify(input.name) });
        await tx
          .insert(schema.workspaceMember)
          .values({ workspaceId: id, userId: ctx.user.id, role: "owner" });
      });
      await track(ctx.user.id, id, "workspace_created");
      return { id };
    }),

  repos: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const member = await assertMember(ctx.user.id, input.workspaceId);
      const [rows, visible] = await Promise.all([
        db
          .select({
            id: schema.repository.id,
            fullName: schema.repository.fullName,
            enabled: schema.repository.enabled,
            aiEnabled: schema.repository.aiEnabled,
            autoAssign: schema.repository.autoAssign,
            checklistTemplate: schema.repository.checklistTemplate,
            installation: schema.githubInstallation.accountLogin,
            suspended: schema.githubInstallation.suspendedAt,
          })
          .from(schema.repository)
          .innerJoin(
            schema.githubInstallation,
            eq(schema.githubInstallation.id, schema.repository.installationId),
          )
          .where(eq(schema.githubInstallation.workspaceId, input.workspaceId))
          .orderBy(asc(schema.repository.fullName)),
        db
          .select({ repoId: schema.githubRepoAccess.repoId })
          .from(schema.githubRepoAccess)
          .where(eq(schema.githubRepoAccess.userId, ctx.user.id)),
      ]);
      const onGithub = new Set(visible.map((v) => v.repoId));
      // Admins see every repo to manage them; `accessible` says whether *this* person can open it.
      return rows
        .map((r) => ({
          ...r,
          accessible: onGithub.has(r.id) && (!member.repoIds || member.repoIds.includes(r.id)),
        }))
        .filter((r) => r.accessible || can(member.role, "repos.manage"));
    }),

  setRepo: protectedProcedure
    .input(
      z.object({
        repoId: z.number(),
        enabled: z.boolean().optional(),
        aiEnabled: z.boolean().optional(),
        autoAssign: z.number().int().min(0).max(5).optional(),
        checklistTemplate: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [repo] = await db
        .select({ workspaceId: schema.githubInstallation.workspaceId, enabled: schema.repository.enabled })
        .from(schema.repository)
        .innerJoin(
          schema.githubInstallation,
          eq(schema.githubInstallation.id, schema.repository.installationId),
        )
        .where(eq(schema.repository.id, input.repoId))
        .limit(1);
      if (!repo) throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
      await assertCan(ctx.user.id, repo.workspaceId, "repos.manage");

      if (input.enabled && !repo.enabled) await assertCanEnableRepo(repo.workspaceId);
      await audit(repo.workspaceId, ctx.user.id, "repo.settings", String(input.repoId), {
        enabled: input.enabled,
        aiEnabled: input.aiEnabled,
        autoAssign: input.autoAssign,
      });

      const { repoId, ...set } = input;
      if (Object.keys(set).length) {
        await db.update(schema.repository).set(set).where(eq(schema.repository.id, repoId));
      }
      // Re-enabling a repo needs a fresh backfill: webhooks were ignored meanwhile.
      if (input.enabled && !repo.enabled) await enqueue("sync_repo", { repoId });
    }),

  rename: protectedProcedure
    .input(z.object({ workspaceId: z.string(), name: z.string().trim().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "workspace.manage");
      await audit(input.workspaceId, ctx.user.id, "workspace.rename", null, { name: input.name });
      await db
        .update(schema.workspace)
        .set({ name: input.name })
        .where(eq(schema.workspace.id, input.workspaceId));
    }),

  members: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMember(ctx.user.id, input.workspaceId);
      return db
        .select({
          userId: schema.user.id,
          name: schema.user.name,
          email: schema.user.email,
          role: schema.workspaceMember.role,
          repoIds: schema.workspaceMember.repoIds,
          githubLogin: schema.githubIdentity.githubLogin,
          joinedAt: schema.workspaceMember.createdAt,
        })
        .from(schema.workspaceMember)
        .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
        .leftJoin(schema.githubIdentity, eq(schema.githubIdentity.userId, schema.user.id))
        .where(eq(schema.workspaceMember.workspaceId, input.workspaceId))
        .orderBy(asc(schema.workspaceMember.createdAt));
    }),

  /** Owners remove anyone; anyone can remove themselves. The last owner can't leave. */
  removeMember: protectedProcedure
    .input(z.object({ workspaceId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const actor =
        input.userId === ctx.user.id
          ? await assertMember(ctx.user.id, input.workspaceId)
          : await assertCan(ctx.user.id, input.workspaceId, "members.manage");

      const [target] = await db
        .select({ role: schema.workspaceMember.role })
        .from(schema.workspaceMember)
        .where(
          and(
            eq(schema.workspaceMember.workspaceId, input.workspaceId),
            eq(schema.workspaceMember.userId, input.userId),
          ),
        )
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Not a member" });
      if (target.role === "owner" && actor.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only an owner can remove an owner" });
      }
      if (target.role === "owner") {
        const [owners] = await db
          .select({ n: count() })
          .from(schema.workspaceMember)
          .where(
            and(
              eq(schema.workspaceMember.workspaceId, input.workspaceId),
              eq(schema.workspaceMember.role, "owner"),
            ),
          );
        if ((owners?.n ?? 0) <= 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A workspace needs at least one owner" });
        }
      }
      await db
        .delete(schema.workspaceMember)
        .where(
          and(
            eq(schema.workspaceMember.workspaceId, input.workspaceId),
            eq(schema.workspaceMember.userId, input.userId),
          ),
        );
      await audit(input.workspaceId, ctx.user.id, input.userId === ctx.user.id ? "member.leave" : "member.remove", input.userId);
      await updateSeats(input.workspaceId);
    }),

  setRole: protectedProcedure
    .input(z.object({ workspaceId: z.string(), userId: z.string(), role: z.enum(ROLES) }))
    .mutation(async ({ ctx, input }) => {
      const actor = await assertCan(ctx.user.id, input.workspaceId, "members.manage");
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't change your own role. Use Transfer ownership, or ask another owner." });
      }
      const [target] = await db
        .select({ role: schema.workspaceMember.role })
        .from(schema.workspaceMember)
        .where(
          and(
            eq(schema.workspaceMember.workspaceId, input.workspaceId),
            eq(schema.workspaceMember.userId, input.userId),
          ),
        );
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Not a member" });
      // Only owners make or unmake owners.
      if ((input.role === "owner" || target.role === "owner") && actor.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only an owner can change owner roles" });
      }
      await audit(input.workspaceId, ctx.user.id, "member.role", input.userId, { from: target.role, to: input.role });
      await db
        .update(schema.workspaceMember)
        .set({ role: input.role })
        .where(
          and(
            eq(schema.workspaceMember.workspaceId, input.workspaceId),
            eq(schema.workspaceMember.userId, input.userId),
          ),
        );
    }),

  /** Returns the only copy of the token; we store its hash. */
  createInvite: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "members.manage");
      await assertCanAddMember(input.workspaceId);
      await audit(input.workspaceId, ctx.user.id, "invite.create");
      return newInvite(input.workspaceId, ctx.user.id);
    }),

  /** Emails a personal link; only that address can accept it. */
  inviteByEmail: protectedProcedure
    .input(z.object({ workspaceId: z.string(), email: z.string().trim().toLowerCase().email() }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "members.manage");
      await assertCanAddMember(input.workspaceId);
      const [ws] = await db
        .select({ name: schema.workspace.name })
        .from(schema.workspace)
        .where(eq(schema.workspace.id, input.workspaceId));
      const { url } = await newInvite(input.workspaceId, ctx.user.id, input.email);
      await sendEmail({
        to: input.email,
        subject: `${ctx.user.name} invited you to ${ws?.name ?? "a workspace"} on Docks`,
        ...actionEmail({
          intro: `${ctx.user.name} invited you to review pull requests with ${ws?.name ?? "their team"} on Docks. The invite works for 7 days.`,
          action: "Accept invite",
          url,
        }),
      });
      await audit(input.workspaceId, ctx.user.id, "invite.email", input.email);
    }),

  invites: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "members.manage");
      return db
        .select({
          id: schema.workspaceInvite.id,
          email: schema.workspaceInvite.email,
          createdBy: schema.user.name,
          createdAt: schema.workspaceInvite.createdAt,
          expiresAt: schema.workspaceInvite.expiresAt,
        })
        .from(schema.workspaceInvite)
        .innerJoin(schema.user, eq(schema.user.id, schema.workspaceInvite.createdBy))
        .where(
          and(
            eq(schema.workspaceInvite.workspaceId, input.workspaceId),
            isNull(schema.workspaceInvite.revokedAt),
            gt(schema.workspaceInvite.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(schema.workspaceInvite.createdAt));
    }),

  revokeInvite: protectedProcedure
    .input(z.object({ workspaceId: z.string(), inviteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "members.manage");
      await audit(input.workspaceId, ctx.user.id, "invite.revoke", input.inviteId);
      await db
        .update(schema.workspaceInvite)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.workspaceInvite.id, input.inviteId),
            eq(schema.workspaceInvite.workspaceId, input.workspaceId),
          ),
        );
    }),

  /** What the /join page shows before accepting. */
  invitePreview: protectedProcedure
    .input(z.object({ token: z.string().min(16) }))
    .query(async ({ ctx, input }) => {
      const invite = await findInvite(input.token);
      const [existing] = await db
        .select({ role: schema.workspaceMember.role })
        .from(schema.workspaceMember)
        .where(
          and(
            eq(schema.workspaceMember.workspaceId, invite.workspaceId),
            eq(schema.workspaceMember.userId, ctx.user.id),
          ),
        )
        .limit(1);
      return {
        workspaceName: invite.workspaceName,
        alreadyMember: Boolean(existing),
        // Shown so the person knows to switch accounts, not to reveal anything new.
        wrongAccount: invite.email && invite.email !== ctx.user.email.toLowerCase() ? invite.email : null,
      };
    }),

  /** Links are reusable until they expire or are revoked; seat limits still apply. */
  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string().min(16) }))
    .mutation(async ({ ctx, input }) => {
      const invite = await findInvite(input.token);
      if (invite.email && invite.email !== ctx.user.email.toLowerCase()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `This invite is for ${invite.email}. Sign in with that email to accept it.`,
        });
      }
      const [existing] = await db
        .select({ role: schema.workspaceMember.role })
        .from(schema.workspaceMember)
        .where(
          and(
            eq(schema.workspaceMember.workspaceId, invite.workspaceId),
            eq(schema.workspaceMember.userId, ctx.user.id),
          ),
        )
        .limit(1);
      if (existing) return { workspaceId: invite.workspaceId };
      await assertCanAddMember(invite.workspaceId);
      await db
        .insert(schema.workspaceMember)
        .values({ workspaceId: invite.workspaceId, userId: ctx.user.id, role: "member" })
        .onConflictDoNothing();
      await audit(invite.workspaceId, ctx.user.id, "member.join");
      await updateSeats(invite.workspaceId);
      return { workspaceId: invite.workspaceId };
    }),

  /** Everything we hold for the workspace, as JSON (plan.md §10). Patches excluded: they're GitHub's data. */
  export: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "workspace.manage");
      await audit(input.workspaceId, ctx.user.id, "workspace.export");
      const [workspace] = await db
        .select()
        .from(schema.workspace)
        .where(eq(schema.workspace.id, input.workspaceId));
      const members = await db
        .select({
          name: schema.user.name,
          email: schema.user.email,
          role: schema.workspaceMember.role,
          joinedAt: schema.workspaceMember.createdAt,
        })
        .from(schema.workspaceMember)
        .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
        .where(eq(schema.workspaceMember.workspaceId, input.workspaceId));
      const repos = await reposOf(input.workspaceId);
      const repoIds = repos.map((r) => r.id);
      const fullNames = repos.map((r) => r.fullName);
      const auditEntries = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.workspaceId, input.workspaceId))
        .orderBy(desc(schema.auditLog.at));
      const [pullRequests, reviews, guides] = repoIds.length
        ? await Promise.all([
            db.select().from(schema.pullRequest).where(inArray(schema.pullRequest.repoId, repoIds)),
            db.select().from(schema.prReview).where(inArray(schema.prReview.repoId, repoIds)),
            db.select().from(schema.reviewGuide).where(inArray(schema.reviewGuide.repo, fullNames)),
          ])
        : [[], [], []];
      return {
        exportedAt: new Date().toISOString(),
        workspace: workspace && {
          id: workspace.id,
          name: workspace.name,
          plan: workspace.plan,
          createdAt: workspace.createdAt,
        },
        members,
        repositories: repos,
        pullRequests,
        reviews,
        guides,
        auditLog: auditEntries,
      };
    }),

  /** Owner only. Paid workspaces cancel billing first so nobody is charged for a deleted workspace. */
  delete: protectedProcedure
    .input(z.object({ workspaceId: z.string(), confirmName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "workspace.delete");
      const [ws] = await db
        .select({ name: schema.workspace.name, plan: schema.workspace.plan })
        .from(schema.workspace)
        .where(eq(schema.workspace.id, input.workspaceId));
      if (!ws) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
      if (input.confirmName !== ws.name) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Type the workspace name exactly to confirm" });
      }
      if (ws.plan === "team") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cancel the Team subscription in Billing first, then delete the workspace.",
        });
      }
      const repos = await reposOf(input.workspaceId);
      const repoIds = repos.map((r) => r.id);
      const fullNames = repos.map((r) => r.fullName);
      await db.transaction(async (tx) => {
        // Mirror tables keyed by repo without foreign keys; the rest cascades from workspace.
        if (repoIds.length) {
          await tx.delete(schema.prFile).where(inArray(schema.prFile.repoId, repoIds));
          await tx.delete(schema.prReview).where(inArray(schema.prReview.repoId, repoIds));
          await tx.delete(schema.prCheck).where(inArray(schema.prCheck.repoId, repoIds));
          await tx.delete(schema.reviewGuide).where(inArray(schema.reviewGuide.repo, fullNames));
          await tx.delete(schema.reviewProgress).where(inArray(schema.reviewProgress.repo, fullNames));
        }
        await tx.delete(schema.workspace).where(eq(schema.workspace.id, input.workspaceId));
      });
    }),

  /** null = all repos. Admins use this to limit contractors or a team to some repos. */
  setMemberRepos: protectedProcedure
    .input(z.object({ workspaceId: z.string(), userId: z.string(), repoIds: z.array(z.number()).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "members.manage");
      await db
        .update(schema.workspaceMember)
        .set({ repoIds: input.repoIds })
        .where(
          and(
            eq(schema.workspaceMember.workspaceId, input.workspaceId),
            eq(schema.workspaceMember.userId, input.userId),
          ),
        );
      await audit(input.workspaceId, ctx.user.id, "member.repos", input.userId, { repoIds: input.repoIds });
    }),

  /** Owner hands over: the new owner gets "owner", the old one becomes "admin". */
  transferOwnership: protectedProcedure
    .input(z.object({ workspaceId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const actor = await assertMember(ctx.user.id, input.workspaceId);
      if (actor.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Only an owner can transfer ownership" });
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick someone else" });
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(schema.workspaceMember)
          .set({ role: "owner" })
          .where(
            and(
              eq(schema.workspaceMember.workspaceId, input.workspaceId),
              eq(schema.workspaceMember.userId, input.userId),
            ),
          )
          .returning({ userId: schema.workspaceMember.userId });
        if (!updated.length) throw new TRPCError({ code: "NOT_FOUND", message: "Not a member" });
        await tx
          .update(schema.workspaceMember)
          .set({ role: "admin" })
          .where(
            and(
              eq(schema.workspaceMember.workspaceId, input.workspaceId),
              eq(schema.workspaceMember.userId, ctx.user.id),
            ),
          );
      });
      await audit(input.workspaceId, ctx.user.id, "workspace.transfer", input.userId);
    }),

  /** Turning it on requires the admin to have 2FA themselves, so they can't lock themselves out. */
  setRequire2fa: protectedProcedure
    .input(z.object({ workspaceId: z.string(), required: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "workspace.manage");
      if (input.required) {
        const [me] = await db
          .select({ on: schema.user.twoFactorEnabled })
          .from(schema.user)
          .where(eq(schema.user.id, ctx.user.id));
        if (!me?.on) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Turn on two-factor authentication for your own account first" });
        }
      }
      await db
        .update(schema.workspace)
        .set({ require2fa: input.required })
        .where(eq(schema.workspace.id, input.workspaceId));
      await audit(input.workspaceId, ctx.user.id, "workspace.require_2fa", null, { required: input.required });
    }),

  setStuckHours: protectedProcedure
    .input(z.object({ workspaceId: z.string(), hours: z.number().int().min(1).max(24 * 14) }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "workspace.manage");
      await db.update(schema.workspace).set({ stuckHours: input.hours }).where(eq(schema.workspace.id, input.workspaceId));
      await audit(input.workspaceId, ctx.user.id, "workspace.stuck_hours", null, { hours: input.hours });
    }),

  settings: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const member = await assertMember(ctx.user.id, input.workspaceId);
      const permissions = Object.fromEntries(
        (Object.keys(CAN) as Action[]).map((action) => [action, can(member.role, action)]),
      ) as Record<Action, boolean>;
      const [ws] = await db
        .select({ stuckHours: schema.workspace.stuckHours })
        .from(schema.workspace)
        .where(eq(schema.workspace.id, input.workspaceId));
      return { role: member.role, require2fa: member.require2fa, stuckHours: ws?.stuckHours ?? 24, can: permissions };
    }),

  auditLog: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        action: z.string().optional(),
        actorId: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "audit.read");
      return db
        .select({
          id: schema.auditLog.id,
          action: schema.auditLog.action,
          target: schema.auditLog.target,
          meta: schema.auditLog.meta,
          at: schema.auditLog.at,
          actorId: schema.auditLog.actorId,
          actorName: schema.user.name,
        })
        .from(schema.auditLog)
        .leftJoin(schema.user, eq(schema.user.id, schema.auditLog.actorId))
        .where(
          and(
            eq(schema.auditLog.workspaceId, input.workspaceId),
            input.action ? eq(schema.auditLog.action, input.action) : undefined,
            input.actorId ? eq(schema.auditLog.actorId, input.actorId) : undefined,
          ),
        )
        .orderBy(desc(schema.auditLog.at))
        .limit(input.limit);
    }),
});

async function reposOf(workspaceId: string) {
  return db
    .select({ id: schema.repository.id, fullName: schema.repository.fullName })
    .from(schema.repository)
    .innerJoin(
      schema.githubInstallation,
      eq(schema.githubInstallation.id, schema.repository.installationId),
    )
    .where(eq(schema.githubInstallation.workspaceId, workspaceId));
}
