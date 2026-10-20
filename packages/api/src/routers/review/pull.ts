import { workspacePlan } from "../../plans.js";
import { trackDaily } from "../../analytics.js";
import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { can, repoForUser } from "../../access.js";
import { enqueue } from "../../jobs.js";
import { latestVerdicts } from "../../review/columns.js";
import { rulesChecklist, storedRepoRules } from "../../review/repo-rules.js";
import { guideKey } from "../../review/guide.js";
import { githubIdentity } from "../../review/github-user.js";
import type { RankedFile } from "../../review/types.js";
import { protectedProcedure } from "../../trpc.js";
import { TIER_ORDER, checklistTemplateOf, guideJobPayload, guideState, loadPull, pr } from "./shared.js";

/** The guided review view: PR data, AI guide, viewed state and guide feedback. */
export const pullProcedures = {
  /** Everything the guided review view needs, from the mirror (plan.md §5.3). */
  get: protectedProcedure.input(pr).query(async ({ ctx, input }) => {
    const repoRow = await repoForUser(ctx.user.id, input.repo);
    void trackDaily(
      ctx.user.id,
      repoRow.workspaceId,
      "pr_opened",
      `${repoRow.fullName}#${input.number}`,
    );
    const [pull] = await db
      .select()
      .from(schema.pullRequest)
      .where(
        and(
          eq(schema.pullRequest.repoId, repoRow.id),
          eq(schema.pullRequest.number, input.number),
        ),
      )
      .limit(1);
    if (!pull)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Pull request not synced yet",
      });

    const [files, reviews, checks, progress, identity] = await Promise.all([
      db
        .select()
        .from(schema.prFile)
        .where(
          and(
            eq(schema.prFile.repoId, repoRow.id),
            eq(schema.prFile.prNumber, input.number),
            eq(schema.prFile.headSha, pull.headSha),
          ),
        ),
      db
        .select()
        .from(schema.prReview)
        .where(
          and(
            eq(schema.prReview.repoId, repoRow.id),
            eq(schema.prReview.prNumber, input.number),
          ),
        )
        .orderBy(asc(schema.prReview.submittedAt)),
      db
        .select()
        .from(schema.prCheck)
        .where(
          and(
            eq(schema.prCheck.repoId, repoRow.id),
            eq(schema.prCheck.headSha, pull.headSha),
          ),
        )
        .orderBy(asc(schema.prCheck.name)),
      db
        .select({
          path: schema.reviewProgress.path,
          fileSha: schema.reviewProgress.fileSha,
        })
        .from(schema.reviewProgress)
        .where(
          and(
            eq(schema.reviewProgress.userId, ctx.user.id),
            eq(schema.reviewProgress.repo, repoRow.fullName),
            eq(schema.reviewProgress.prNumber, input.number),
          ),
        ),
      githubIdentity(ctx.user.id),
    ]);

    const seen = new Map(progress.map((p) => [p.path, p.fileSha]));
    const ranked: RankedFile[] = files
      .map((f) => ({
        filename: f.path,
        sha: f.blobSha,
        status: f.status,
        patch: f.patch ?? undefined,
        additions: f.additions,
        deletions: f.deletions,
        tier: f.tier,
        viewed: seen.get(f.path) === f.blobSha,
        changedSinceViewed: seen.has(f.path) && seen.get(f.path) !== f.blobSha,
      }))
      .sort(
        (a, b) =>
          TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
          b.additions + b.deletions - (a.additions + a.deletions) ||
          a.filename.localeCompare(b.filename),
      );

    // Latest verdict per reviewer, for the header.
    const verdictBy = new Map<string, string>();
    for (const r of reviews) {
      if (latestVerdicts([r]).length) verdictBy.set(r.reviewerLogin, r.state);
      else if (r.state === "DISMISSED") verdictBy.delete(r.reviewerLogin);
    }

    return {
      pr: {
        number: pull.number,
        title: pull.title,
        body: pull.body,
        url: `https://github.com/${repoRow.fullName}/pull/${pull.number}`,
        author: pull.authorLogin,
        state: pull.state,
        draft: pull.draft,
        headRef: pull.headRef,
        baseRef: pull.baseRef,
        headSha: pull.headSha,
        additions: pull.additions,
        deletions: pull.deletions,
        column: pull.reviewColumn,
        labels: pull.labels,
        mergeableState: pull.mergeableState,
      },
      // Team questions first, then any `.github/docks.yml` questions whose paths this PR touches.
      checklistTemplate: [
        ...(await checklistTemplateOf(repoRow.id)),
        ...rulesChecklist((await storedRepoRules(repoRow.id))?.rules, ranked.map((f) => f.filename)),
      ],
      advancedReview: (await workspacePlan(repoRow.workspaceId)) === "team",
      canAct: can(repoRow.role, "review.act"),
      files: ranked,
      reviewers: [
        ...pull.requestedReviewers.map((login) => ({
          login,
          state: "PENDING",
        })),
        ...[...verdictBy].map(([login, state]) => ({ login, state })),
      ],
      checks: checks.map((c) => ({
        name: c.name,
        status: c.status,
        conclusion: c.conclusion,
      })),
      me: identity?.login ?? null,
    };
  }),
  /**
   * Guide for the PR's current head commit. Generation runs in the job
   * queue; the client polls while status is "pending" (plan.md §6.3).
   */
  guide: protectedProcedure
    .input(pr)
    .query(async ({ ctx, input }) => guideState(ctx.user.id, input)),
  markViewed: protectedProcedure
    .input(
      pr.extend({ path: z.string(), fileSha: z.string(), viewed: z.boolean() }),
    )
    .mutation(async ({ ctx, input }) => {
      const repoRow = await repoForUser(ctx.user.id, input.repo);
      const key = and(
        eq(schema.reviewProgress.userId, ctx.user.id),
        eq(schema.reviewProgress.repo, repoRow.fullName),
        eq(schema.reviewProgress.prNumber, input.number),
        eq(schema.reviewProgress.path, input.path),
      );
      if (!input.viewed) {
        await db.delete(schema.reviewProgress).where(key);
        return;
      }
      await db
        .insert(schema.reviewProgress)
        .values({
          userId: ctx.user.id,
          repo: repoRow.fullName,
          prNumber: input.number,
          path: input.path,
          fileSha: input.fileSha,
        })
        .onConflictDoUpdate({
          target: [
            schema.reviewProgress.userId,
            schema.reviewProgress.repo,
            schema.reviewProgress.prNumber,
            schema.reviewProgress.path,
          ],
          set: { fileSha: input.fileSha },
        });
    }),
  guideVotes: protectedProcedure
    .input(pr.extend({ headSha: z.string().regex(/^[a-f0-9]{40}$/) }))
    .query(async ({ ctx, input }) => {
      const repoRow = await repoForUser(ctx.user.id, input.repo);
      const rows = await db
        .select({ item: schema.guideFeedback.item, vote: schema.guideFeedback.vote })
        .from(schema.guideFeedback)
        .where(
          and(
            eq(schema.guideFeedback.userId, ctx.user.id),
            eq(schema.guideFeedback.repo, repoRow.fullName),
            eq(schema.guideFeedback.prNumber, input.number),
            eq(schema.guideFeedback.headSha, input.headSha),
          ),
        );
      return Object.fromEntries(rows.map((r) => [r.item, r.vote])) as Record<string, 1 | -1>;
    }),
  /** Thumbs up/down on a guide part; vote 0 clears it. Feeds the guide eval with real-use signal. */
  guideFeedback: protectedProcedure
    .input(
      pr.extend({
        headSha: z.string().regex(/^[a-f0-9]{40}$/),
        item: z.string().regex(/^(summary|step:\d{1,2}|check:\d{1,2})$/),
        vote: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const repoRow = await repoForUser(ctx.user.id, input.repo);
      const key = {
        userId: ctx.user.id,
        repo: repoRow.fullName,
        prNumber: input.number,
        headSha: input.headSha,
        item: input.item,
      };
      if (input.vote === 0) {
        await db
          .delete(schema.guideFeedback)
          .where(
            and(
              eq(schema.guideFeedback.userId, key.userId),
              eq(schema.guideFeedback.repo, key.repo),
              eq(schema.guideFeedback.prNumber, key.prNumber),
              eq(schema.guideFeedback.headSha, key.headSha),
              eq(schema.guideFeedback.item, key.item),
            ),
          );
        return;
      }
      await db
        .insert(schema.guideFeedback)
        .values({ ...key, vote: input.vote })
        .onConflictDoUpdate({
          target: [
            schema.guideFeedback.userId,
            schema.guideFeedback.repo,
            schema.guideFeedback.prNumber,
            schema.guideFeedback.headSha,
            schema.guideFeedback.item,
          ],
          set: { vote: input.vote, updatedAt: new Date() },
        });
    }),
  /** Drop the cached guide and queue a fresh one; at most once a minute per PR. */
  regenerateGuide: protectedProcedure
    .input(pr)
    .mutation(async ({ ctx, input }) => {
      const { repoRow, pull } = await loadPull(ctx.user.id, input);
      if (!can(repoRow.role, "review.act")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role doesn't allow this",
        });
      }
      const [cached] = await db
        .select({ createdAt: schema.reviewGuide.createdAt })
        .from(schema.reviewGuide)
        .where(guideKey(repoRow.fullName, input.number, pull.headSha))
        .limit(1);
      if (cached && Date.now() - cached.createdAt.getTime() < 60_000) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Wait a minute before regenerating",
        });
      }
      await db
        .delete(schema.reviewGuide)
        .where(guideKey(repoRow.fullName, input.number, pull.headSha));
      await db
        .delete(schema.jobs)
        .where(
          and(
            eq(schema.jobs.type, "generate_guide"),
            inArray(schema.jobs.status, ["failed", "done"]),
            sql`${schema.jobs.payload} = ${JSON.stringify(guideJobPayload(repoRow.id, input.number, pull.headSha))}::jsonb`,
          ),
        );
      await enqueue(
        "generate_guide",
        guideJobPayload(repoRow.id, input.number, pull.headSha),
      );
      return guideState(ctx.user.id, input);
    }),
};
