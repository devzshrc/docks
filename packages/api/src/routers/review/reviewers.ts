import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { audit, can, repoForAction, repoForUser } from "../../access.js";
import { githubFailure } from "../../review/errors.js";
import { githubAs, githubIdentity } from "../../review/github-user.js";
import { loginsToUsers, suggestReviewers } from "../../review/reviewers.js";
import { protectedProcedure } from "../../trpc.js";
import { pr, refreshPr } from "./shared.js";

/** Reviewer suggestions, requests and claims. */
export const reviewersProcedures = {
  /** Ranked reviewer suggestions plus who's already requested (plan M4). */
  reviewerOptions: protectedProcedure
    .input(pr)
    .query(async ({ ctx, input }) => {
      const repoRow = await repoForUser(ctx.user.id, input.repo);
      const [pull] = await db
        .select({
          requested: schema.pullRequest.requestedReviewers,
          claimedBy: schema.pullRequest.claimedBy,
        })
        .from(schema.pullRequest)
        .where(
          and(
            eq(schema.pullRequest.repoId, repoRow.id),
            eq(schema.pullRequest.number, input.number),
          ),
        );
      if (!pull)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pull request not synced yet",
        });
      const [suggestions, names] = await Promise.all([
        suggestReviewers(repoRow.id, input.number),
        loginsToUsers(repoRow.workspaceId, pull.requested),
      ]);
      const [claimer] = pull.claimedBy
        ? await db
            .select({ id: schema.user.id, name: schema.user.name })
            .from(schema.user)
            .where(eq(schema.user.id, pull.claimedBy))
        : [];
      return {
        requested: pull.requested.map((login) => ({
          login,
          name: names.get(login) ?? null,
        })),
        suggestions: suggestions.slice(0, 8).map((s) => ({
          login: s.login,
          name: s.name,
          reasons: s.reasons,
          openReviews: s.openReviews,
          atLimit: s.atLimit,
        })),
        claimedBy: claimer
          ? {
              userId: claimer.id,
              name: claimer.name,
              isMe: claimer.id === ctx.user.id,
            }
          : null,
        canAct: can(repoRow.role, "review.act"),
        canReassign: can(repoRow.role, "members.manage"),
        myLogin: (await githubIdentity(ctx.user.id))?.login ?? null,
      };
    }),
  /** Add or remove requested reviewers on GitHub, as the signed-in person. */
  setReviewers: protectedProcedure
    .input(
      pr.extend({
        add: z.array(z.string()).default([]),
        remove: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const repoRow = await repoForAction(
        ctx.user.id,
        input.repo,
        "review.act",
      );
      const gh = githubAs(ctx.user.id);
      if (input.add.length)
        await gh
          .requestReviewers(repoRow.fullName, input.number, input.add)
          .catch(githubFailure);
      if (input.remove.length)
        await gh
          .removeReviewers(repoRow.fullName, input.number, input.remove)
          .catch(githubFailure);
      await audit(
        repoRow.workspaceId,
        ctx.user.id,
        "review.reviewers",
        `${repoRow.fullName}#${input.number}`,
        {
          add: input.add,
          remove: input.remove,
        },
      );
      await refreshPr(repoRow.id, input.number);
    }),
  /** "I'm on it": visible to the team, stops the PR counting as unowned. */
  claim: protectedProcedure
    .input(
      pr.extend({ claim: z.boolean(), expectedOwner: z.string().optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      const repoRow = await repoForAction(
        ctx.user.id,
        input.repo,
        "review.act",
      );
      const [pull] = await db
        .select({ claimedBy: schema.pullRequest.claimedBy })
        .from(schema.pullRequest)
        .where(
          and(
            eq(schema.pullRequest.repoId, repoRow.id),
            eq(schema.pullRequest.number, input.number),
          ),
        );
      if (!pull)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pull request not synced yet",
        });
      if (
        !input.claim &&
        pull.claimedBy &&
        pull.claimedBy !== ctx.user.id &&
        !can(repoRow.role, "members.manage")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the person who claimed it, or an admin, can release it",
        });
      }
      if (
        input.claim &&
        pull.claimedBy &&
        pull.claimedBy !== ctx.user.id &&
        (!can(repoRow.role, "members.manage") ||
          input.expectedOwner !== pull.claimedBy)
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "Someone already owns this review",
        });
      const claimed = await db
        .update(schema.pullRequest)
        .set({ claimedBy: input.claim ? ctx.user.id : null })
        .where(
          and(
            eq(schema.pullRequest.repoId, repoRow.id),
            eq(schema.pullRequest.number, input.number),
            input.claim
              ? or(
                  isNull(schema.pullRequest.claimedBy),
                  eq(schema.pullRequest.claimedBy, ctx.user.id),
                  input.expectedOwner && can(repoRow.role, "members.manage")
                    ? eq(schema.pullRequest.claimedBy, input.expectedOwner)
                    : undefined,
                )
              : eq(schema.pullRequest.claimedBy, pull.claimedBy ?? ctx.user.id),
          ),
        )
        .returning({ owner: schema.pullRequest.claimedBy });
      if (!claimed.length)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Review ownership changed. Refresh and try again.",
        });
      await audit(
        repoRow.workspaceId,
        ctx.user.id,
        input.claim ? "review.claim" : "review.unclaim",
        `${repoRow.fullName}#${input.number}`,
      );
    }),
};
