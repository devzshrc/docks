import { TRPCError } from "@trpc/server";
import { db, schema } from "@docks/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { assertMember, repoForUser, visibleRepos } from "../access.js";
import { protectedProcedure, router } from "../trpc.js";
import { githubIdentity } from "../review/github-user.js";

export const reviewInboxRouter = router({
  snooze: protectedProcedure
    .input(
      z.object({
        repo: z.string().max(200),
        number: z.number().int().positive(),
        until: z
          .date()
          .nullable()
          .refine(
            (d) =>
              !d ||
              (d.getTime() > Date.now() &&
                d.getTime() <= Date.now() + 30 * 86400000),
            "Choose a date within 30 days",
          ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const r = await repoForUser(ctx.user.id, input.repo);
      const [pull] = await db
        .select({ number: schema.pullRequest.number })
        .from(schema.pullRequest)
        .where(
          and(
            eq(schema.pullRequest.repoId, r.id),
            eq(schema.pullRequest.number, input.number),
          ),
        );
      if (!pull)
        throw new TRPCError({ code: "NOT_FOUND", message: "PR not found" });
      await db
        .insert(schema.reviewInboxState)
        .values({
          userId: ctx.user.id,
          repoId: r.id,
          prNumber: input.number,
          snoozedUntil: input.until,
        })
        .onConflictDoUpdate({
          target: [
            schema.reviewInboxState.userId,
            schema.reviewInboxState.repoId,
            schema.reviewInboxState.prNumber,
          ],
          set: { snoozedUntil: input.until, updatedAt: new Date() },
        });
    }),
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        view: z
          .enum(["needs_review", "changed", "my_prs", "overdue", "snoozed"])
          .default("needs_review"),
        page: z.number().int().min(0).max(10000).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const m = await assertMember(ctx.user.id, input.workspaceId);
      const repos = await visibleRepos(
        ctx.user.id,
        input.workspaceId,
        m.repoIds,
      );
      const ids = repos.map((r) => r.id);
      if (!ids.length) return { items: [], more: false };
      const identity = await githubIdentity(ctx.user.id);
      const login = identity?.login?.toLowerCase() ?? "";
      const reviewed = sql`EXISTS (SELECT 1 FROM pr_review r WHERE r.repo_id = ${schema.pullRequest.repoId} AND r.pr_number = ${schema.pullRequest.number} AND lower(r.reviewer_login) = ${login} AND r.commit_sha = ${schema.pullRequest.headSha} AND r.state IN ('APPROVED', 'CHANGES_REQUESTED'))`;
      const snoozed = sql`EXISTS (SELECT 1 FROM review_inbox_state s WHERE s.repo_id = ${schema.pullRequest.repoId} AND s.pr_number = ${schema.pullRequest.number} AND s.user_id = ${ctx.user.id} AND s.snoozed_until > now())`;
      const mine = sql`((${schema.pullRequest.claimedBy} = ${ctx.user.id} AND NOT (${reviewed})) OR EXISTS (SELECT 1 FROM unnest(${schema.pullRequest.requestedReviewers}) reviewer WHERE lower(reviewer) = ${login} AND ${login} <> ''))`;
      const changed = sql`EXISTS (SELECT 1 FROM pr_review r WHERE r.repo_id = ${schema.pullRequest.repoId} AND r.pr_number = ${schema.pullRequest.number} AND lower(r.reviewer_login) = ${login} AND r.state NOT IN ('PENDING','DISMISSED') AND r.commit_sha <> ${schema.pullRequest.headSha} AND NOT EXISTS (SELECT 1 FROM pr_review latest WHERE latest.repo_id = r.repo_id AND latest.pr_number = r.pr_number AND lower(latest.reviewer_login) = ${login} AND latest.state NOT IN ('PENDING','DISMISSED') AND latest.submitted_at > r.submitted_at))`;
      const overdue = sql`EXISTS (SELECT 1 FROM review_cycle c WHERE c.repo_id = ${schema.pullRequest.repoId} AND c.pr_number = ${schema.pullRequest.number} AND lower(c.reviewer) = ${login} AND c.completed_at IS NULL AND c.cancelled_at IS NULL AND c.paused_at IS NULL AND c.due_at <= now())`;
      const items = await db
        .select({
          repo: schema.repository.fullName,
          number: schema.pullRequest.number,
          title: schema.pullRequest.title,
          headSha: schema.pullRequest.headSha,
          draft: schema.pullRequest.draft,
          column: schema.pullRequest.reviewColumn,
          claimedBy: schema.pullRequest.claimedBy,
          requestedReviewers: schema.pullRequest.requestedReviewers,
          lastActivityAt: schema.pullRequest.lastActivityAt,
          syncedAt: schema.pullRequest.updatedAt,
        })
        .from(schema.pullRequest)
        .innerJoin(
          schema.repository,
          eq(schema.repository.id, schema.pullRequest.repoId),
        )
        .where(
          and(
            inArray(schema.pullRequest.repoId, ids),
            eq(schema.pullRequest.state, "open"),
            input.view === "snoozed" ? snoozed : sql`NOT (${snoozed})`,
            input.view === "my_prs"
              ? sql`lower(${schema.pullRequest.authorLogin}) = ${login} AND ${login} <> ''`
              : input.view === "changed"
                ? changed
                : input.view === "overdue"
                  ? overdue
                  : input.view === "snoozed"
                    ? undefined
                    : mine,
          ),
        )
        .orderBy(
          desc(schema.pullRequest.lastActivityAt),
          schema.pullRequest.repoId,
          schema.pullRequest.number,
        )
        .offset(input.page * 30)
        .limit(31);
      return { items: items.slice(0, 30), more: items.length > 30 };
    }),
});
