import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  assertCan,
  assertMember,
  audit,
  canSeeRepo,
  repoForAction,
  repoForUser,
  visibleRepos,
} from "../access.js";
import { assertTeam, workspacePlan } from "../plans.js";
import { protectedProcedure, router } from "../trpc.js";
import { rulesSchema } from "../delivery/clock.js";
import { enqueue } from "../jobs.js";
import { githubAs } from "../review/github-user.js";
import { installationClient } from "../review/github.js";
import { githubFailure } from "../review/errors.js";
import { suggestReviewers } from "../review/reviewers.js";
import { reconcileDeadlines } from "../delivery/deadlines.js";

const ws = z.object({ workspaceId: z.string() });
const pr = z.object({ repo: z.string(), number: z.number().int().positive() });
export const deliveryRouter = router({
  policies: protectedProcedure.input(ws).query(async ({ ctx, input }) => {
    const member = await assertMember(ctx.user.id, input.workspaceId);
    const repos = await visibleRepos(
      ctx.user.id,
      input.workspaceId,
      member.repoIds,
    );
    const policies = repos.length
      ? await db
          .select()
          .from(schema.reviewPolicy)
          .where(
            inArray(
              schema.reviewPolicy.repoId,
              repos.map((r) => r.id),
            ),
          )
      : [];
    const members = await db
      .select({
        userId: schema.user.id,
        name: schema.user.name,
        role: schema.workspaceMember.role,
      })
      .from(schema.workspaceMember)
      .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
      .where(eq(schema.workspaceMember.workspaceId, input.workspaceId));
    return {
      repos,
      policies,
      members: members.filter((m) => ["owner", "admin"].includes(m.role)),
      plan: await workspacePlan(input.workspaceId),
      canManage: ["owner", "admin"].includes(member.role),
    };
  }),
  savePolicy: protectedProcedure
    .input(
      z.object({ repo: z.string(), enabled: z.boolean(), rules: rulesSchema }),
    )
    .mutation(async ({ ctx, input }) => {
      const repo = await repoForAction(ctx.user.id, input.repo, "repos.manage");
      if (input.enabled) await assertTeam(repo.workspaceId);
      if (input.enabled) {
        const lead = await assertCan(
          input.rules.leadUserId,
          repo.workspaceId,
          "repos.manage",
        );
        if (!(await canSeeRepo(input.rules.leadUserId, lead.repoIds, repo.id)))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The lead needs access to this repository.",
          });
      }
      await db
        .insert(schema.reviewPolicy)
        .values({ repoId: repo.id, enabled: input.enabled, rules: input.rules })
        .onConflictDoUpdate({
          target: schema.reviewPolicy.repoId,
          set: { enabled: input.enabled, rules: input.rules },
        });
      if (!input.enabled)
        await db
          .update(schema.reviewCycle)
          .set({ cancelledAt: new Date(), cancelReason: "Policy disabled" })
          .where(
            and(
              eq(schema.reviewCycle.repoId, repo.id),
              isNull(schema.reviewCycle.completedAt),
              isNull(schema.reviewCycle.cancelledAt),
            ),
          );
      else {
        const pulls = await db
          .select({ number: schema.pullRequest.number })
          .from(schema.pullRequest)
          .where(
            and(
              eq(schema.pullRequest.repoId, repo.id),
              eq(schema.pullRequest.state, "open"),
            ),
          );
        for (const pull of pulls)
          await enqueue("sync_pr", { repoId: repo.id, number: pull.number });
      }
      await audit(
        repo.workspaceId,
        ctx.user.id,
        "review.policy",
        repo.fullName,
        { enabled: input.enabled, rules: input.rules },
      );
    }),
  cycles: protectedProcedure
    .input(ws.extend({ overdueOnly: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const member = await assertMember(ctx.user.id, input.workspaceId);
      const repos = await visibleRepos(
        ctx.user.id,
        input.workspaceId,
        member.repoIds,
      );
      if (!repos.length) return [];
      return db
        .select({
          cycle: schema.reviewCycle,
          repo: schema.repository.fullName,
          title: schema.pullRequest.title,
          state: schema.pullRequest.state,
        })
        .from(schema.reviewCycle)
        .innerJoin(
          schema.repository,
          eq(schema.repository.id, schema.reviewCycle.repoId),
        )
        .innerJoin(
          schema.pullRequest,
          and(
            eq(schema.pullRequest.repoId, schema.reviewCycle.repoId),
            eq(schema.pullRequest.number, schema.reviewCycle.prNumber),
          ),
        )
        .where(
          and(
            inArray(
              schema.reviewCycle.repoId,
              repos.map((r) => r.id),
            ),
            isNull(schema.reviewCycle.cancelledAt),
            isNull(schema.reviewCycle.completedAt),
            input.overdueOnly
              ? sql`${schema.reviewCycle.dueAt} <= now() AND ${schema.reviewCycle.pausedAt} IS NULL`
              : undefined,
          ),
        )
        .orderBy(schema.reviewCycle.dueAt)
        .limit(100);
    }),
  prCycles: protectedProcedure.input(pr).query(async ({ ctx, input }) => {
    const repo = await repoForUser(ctx.user.id, input.repo);
    return db
      .select()
      .from(schema.reviewCycle)
      .where(
        and(
          eq(schema.reviewCycle.repoId, repo.id),
          eq(schema.reviewCycle.prNumber, input.number),
          isNull(schema.reviewCycle.cancelledAt),
          isNull(schema.reviewCycle.completedAt),
        ),
      )
      .orderBy(schema.reviewCycle.dueAt);
  }),
  backups: protectedProcedure.input(pr).query(async ({ ctx, input }) => {
    const repo = await repoForUser(ctx.user.id, input.repo);
    await assertTeam(repo.workspaceId);
    return (await suggestReviewers(repo.id, input.number)).filter(
      (r) => !r.atLimit,
    );
  }),
  requestBackup: protectedProcedure
    .input(
      z.object({
        cycleId: z.string().uuid(),
        login: z.string().regex(/^[A-Za-z0-9-]{1,39}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .select({ cycle: schema.reviewCycle, repo: schema.repository.fullName })
        .from(schema.reviewCycle)
        .innerJoin(
          schema.repository,
          eq(schema.repository.id, schema.reviewCycle.repoId),
        )
        .where(eq(schema.reviewCycle.id, input.cycleId));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const repo = await repoForAction(ctx.user.id, row.repo, "repos.manage");
      await assertTeam(repo.workspaceId);
      const gh = githubAs(ctx.user.id);
      const [details] = await db
        .select()
        .from(schema.repository)
        .where(eq(schema.repository.id, repo.id));
      const installation = installationClient(details!.installationId);
      const [live, reviews] = await Promise.all([
        installation.getPull(repo.fullName, row.cycle.prNumber),
        installation.listReviews(repo.fullName, row.cycle.prNumber),
      ]);
      await reconcileDeadlines(repo.id, live, reviews);
      const candidates = await suggestReviewers(repo.id, row.cycle.prNumber);
      if (
        !candidates.some(
          (c) =>
            c.login.toLowerCase() === input.login.toLowerCase() && !c.atLimit,
        ) ||
        live.requested_reviewers.some(
          (r) => r.login.toLowerCase() === input.login.toLowerCase(),
        )
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "This reviewer is no longer available. Refresh suggestions.",
        });
      await db.transaction(async (tx) => {
        const result = await tx.execute<{ id: string }>(
          sql`SELECT id FROM review_cycle WHERE id = ${input.cycleId} FOR UPDATE`,
        );
        if (!result.rows.length) throw new TRPCError({ code: "NOT_FOUND" });
        const [cycle] = await tx
          .select()
          .from(schema.reviewCycle)
          .where(eq(schema.reviewCycle.id, input.cycleId));
        if (
          !cycle ||
          cycle.backupLogin ||
          cycle.completedAt ||
          cycle.cancelledAt ||
          cycle.pausedAt ||
          cycle.dueAt > new Date() ||
          live.draft ||
          live.state !== "open"
        )
          throw new TRPCError({
            code: "CONFLICT",
            message: "This cycle no longer needs a backup.",
          });
        // Refresh eligibility after acquiring the cycle lock: another approval can wait here.
        const current = await gh.getPull(repo.fullName, cycle.prNumber);
        const eligible = await suggestReviewers(repo.id, cycle.prNumber);
        if (
          current.state !== "open" ||
          current.draft ||
          current.head.sha !== live.head.sha ||
          current.requested_reviewers.some(
            (r) => r.login.toLowerCase() === input.login.toLowerCase(),
          ) ||
          !eligible.some(
            (r) =>
              r.login.toLowerCase() === input.login.toLowerCase() && !r.atLimit,
          )
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "The PR or reviewer changed. Refresh before requesting a backup.",
          });
        await assertTeam(repo.workspaceId);
        await repoForAction(ctx.user.id, repo.fullName, "repos.manage");
        await gh
          .requestReviewers(repo.fullName, cycle.prNumber, [input.login])
          .catch(githubFailure);
        await tx
          .update(schema.reviewCycle)
          .set({ backupLogin: input.login })
          .where(eq(schema.reviewCycle.id, cycle.id));
      });
      await audit(
        repo.workspaceId,
        ctx.user.id,
        "review.backup",
        `${repo.fullName}#${row.cycle.prNumber}`,
        { login: input.login, cycleId: input.cycleId },
      );
      await enqueue("sync_pr", { repoId: repo.id, number: row.cycle.prNumber });
    }),
});
