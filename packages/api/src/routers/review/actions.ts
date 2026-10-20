import { track } from "../../analytics.js";
import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { audit, repoForAction, repoForUser } from "../../access.js";
import { githubFailure } from "../../review/errors.js";
import { githubAs } from "../../review/github-user.js";
import { emptySession, sessionData } from "../../review/session.js";
import { computeMergeReadiness } from "../../review/merge-readiness.js";
import { protectedProcedure } from "../../trpc.js";
import { lineComment, pr, recordVisit, refreshPr } from "./shared.js";

/** Review verdicts, private sessions, merge and description. */
export const actionsProcedures = {
  submit: protectedProcedure
    .input(
      pr.extend({
        headSha: z.string().regex(/^[a-f0-9]{40}$/),
        event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
        body: z.string().default(""),
        comments: z.array(lineComment).max(100).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const repoRow = await repoForAction(
        ctx.user.id,
        input.repo,
        "review.act",
      );
      if (
        input.event !== "APPROVE" &&
        !input.body.trim() &&
        !input.comments.length
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add a comment explaining your review",
        });
      }
      const live = await githubAs(ctx.user.id)
        .getPull(repoRow.fullName, input.number)
        .catch(githubFailure);
      if (live.head.sha !== input.headSha)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "New commits arrived. Refresh and inspect your comment locations.",
        });
      await githubAs(ctx.user.id)
        .submitReview(
          repoRow.fullName,
          input.number,
          input.event,
          input.body,
          input.comments,
          input.headSha,
        )
        .catch(githubFailure);
      await recordVisit(ctx.user.id, repoRow, input.number, input.headSha);
      await audit(
        repoRow.workspaceId,
        ctx.user.id,
        `review.${input.event.toLowerCase()}`,
        `${repoRow.fullName}#${input.number}`,
      );
      await track(ctx.user.id, repoRow.workspaceId, "review_submitted", {
        event: input.event,
        comments: input.comments.length,
      });
      await refreshPr(repoRow.id, input.number);
    }),
  session: protectedProcedure
    .input(pr.extend({ clientUserId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (input.clientUserId !== ctx.user.id)
        throw new TRPCError({ code: "UNAUTHORIZED" });
      const repo = await repoForUser(ctx.user.id, input.repo);
      const [row] = await db
        .select()
        .from(schema.reviewSession)
        .where(
          and(
            eq(schema.reviewSession.userId, ctx.user.id),
            eq(schema.reviewSession.repoId, repo.id),
            eq(schema.reviewSession.prNumber, input.number),
          ),
        );
      return {
        version: row?.version ?? 0,
        data: row?.data ?? emptySession(),
        updatedAt: row?.updatedAt ?? null,
      };
    }),
  saveSession: protectedProcedure
    .input(
      pr.extend({ version: z.number().int().nonnegative(), data: sessionData }),
    )
    .mutation(async ({ ctx, input }) => {
      const repo = await repoForUser(ctx.user.id, input.repo);
      const key = and(
        eq(schema.reviewSession.userId, ctx.user.id),
        eq(schema.reviewSession.repoId, repo.id),
        eq(schema.reviewSession.prNumber, input.number),
      );
      const rows =
        input.version === 0
          ? await db
              .insert(schema.reviewSession)
              .values({
                userId: ctx.user.id,
                repoId: repo.id,
                prNumber: input.number,
                data: input.data,
              })
              .onConflictDoNothing()
              .returning({ version: schema.reviewSession.version })
          : await db
              .update(schema.reviewSession)
              .set({ data: input.data, version: input.version + 1 })
              .where(and(key, eq(schema.reviewSession.version, input.version)))
              .returning({ version: schema.reviewSession.version });
      if (!rows.length)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Another device changed this review. Both copies are preserved.",
        });
      return { version: rows[0]!.version };
    }),
  mergeReadiness: protectedProcedure.input(pr).query(async ({ ctx, input }) => {
    await repoForUser(ctx.user.id, input.repo);
    try {
      return computeMergeReadiness(
        await githubAs(ctx.user.id).mergeSnapshot(input.repo, input.number),
      );
    } catch {
      return computeMergeReadiness(null);
    }
  }),
  merge: protectedProcedure
    .input(
      pr.extend({
        method: z.enum(["merge", "squash", "rebase"]).default("squash"),
        headSha: z.string().regex(/^[a-f0-9]{40}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const repoRow = await repoForAction(
        ctx.user.id,
        input.repo,
        "review.act",
      );
      const result = await githubAs(ctx.user.id)
        .merge(repoRow.fullName, input.number, input.method, input.headSha)
        .catch(githubFailure);
      if (!result.merged)
        throw new TRPCError({
          code: "CONFLICT",
          message: result.message || "GitHub did not merge this pull request",
        });
      await audit(
        repoRow.workspaceId,
        ctx.user.id,
        "review.merge",
        `${repoRow.fullName}#${input.number}`,
        { method: input.method },
      );
      await track(ctx.user.id, repoRow.workspaceId, "merged");
      await refreshPr(repoRow.id, input.number);
      return { merged: result.merged };
    }),
  /** Set the PR description (the author accepting a suggested description from the review guide). */
  updateDescription: protectedProcedure
    .input(pr.extend({ body: z.string().min(1).max(20_000) }))
    .mutation(async ({ ctx, input }) => {
      const repoRow = await repoForAction(ctx.user.id, input.repo, "review.act");
      await githubAs(ctx.user.id).updateBody(repoRow.fullName, input.number, input.body).catch(githubFailure);
      await audit(repoRow.workspaceId, ctx.user.id, "review.description", `${repoRow.fullName}#${input.number}`);
      await refreshPr(repoRow.id, input.number);
      return { ok: true };
    }),
  /** Turn on GitHub auto-merge: GitHub merges by itself once checks and required reviews pass. */
  autoMerge: protectedProcedure
    .input(pr.extend({ method: z.enum(["merge", "squash", "rebase"]).default("squash") }))
    .mutation(async ({ ctx, input }) => {
      const repoRow = await repoForAction(ctx.user.id, input.repo, "review.act");
      await githubAs(ctx.user.id)
        .enableAutoMerge(repoRow.fullName, input.number, input.method)
        .catch(githubFailure);
      await audit(repoRow.workspaceId, ctx.user.id, "review.auto_merge", `${repoRow.fullName}#${input.number}`, {
        method: input.method,
      });
      return { enabled: true };
    }),
};
