import { workspacePlan } from "../../plans.js";
import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, repoForAction, repoForUser } from "../../access.js";
import { githubFailure } from "../../review/errors.js";
import { type BlameRange, installationClient } from "../../review/github.js";
import { githubAs, githubIdentity } from "../../review/github-user.js";
import { protectedProcedure } from "../../trpc.js";
import { blameCache, headShaOf, lineComment, mergeBases, pr, remember, repoDetails } from "./shared.js";

/** Comment threads, incremental diffs, full files and blame. */
export const threadsProcedures = {
  /** Review threads, live from GitHub as the person (plan M6). Not mirrored. */
  threads: protectedProcedure.input(pr).query(async ({ ctx, input }) => {
    const repoRow = await repoForUser(ctx.user.id, input.repo);
    try {
      return {
        threads: await githubAs(ctx.user.id).threads(
          repoRow.fullName,
          input.number,
        ),
        needsGithub: false,
      };
    } catch (err) {
      if (err instanceof TRPCError && err.code === "PRECONDITION_FAILED")
        return { threads: [], needsGithub: true };
      return githubFailure(err);
    }
  }),
  comment: protectedProcedure
    .input(pr.merge(lineComment))
    .mutation(async ({ ctx, input }) => {
      const repoRow = await repoForAction(
        ctx.user.id,
        input.repo,
        "review.act",
      );
      const { headSha } = await headShaOf(repoRow.id, input.number);
      const { repo: _r, number, ...c } = input;
      await githubAs(ctx.user.id)
        .comment(repoRow.fullName, number, headSha, c)
        .catch(githubFailure);
      await audit(
        repoRow.workspaceId,
        ctx.user.id,
        "review.line_comment",
        `${repoRow.fullName}#${number}`,
        { path: c.path, line: c.line },
      );
    }),
  reply: protectedProcedure
    .input(
      pr.extend({
        commentId: z.number().int(),
        body: z.string().trim().min(1).max(65_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const repoRow = await repoForAction(
        ctx.user.id,
        input.repo,
        "review.act",
      );
      await githubAs(ctx.user.id)
        .reply(repoRow.fullName, input.number, input.commentId, input.body)
        .catch(githubFailure);
    }),
  resolveThread: protectedProcedure
    .input(pr.extend({ threadId: z.string(), resolve: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await repoForAction(ctx.user.id, input.repo, "review.act");
      await githubAs(ctx.user.id)
        .resolveThread(input.threadId, input.resolve)
        .catch(githubFailure);
    }),
  /** Files changed since this person last submitted a review; null when they haven't. */
  sinceLastReview: protectedProcedure
    .input(pr)
    .query(async ({ ctx, input }) => {
      const repoRow = await repoForUser(ctx.user.id, input.repo);
      const [visit] = await db
        .select({
          sha: schema.reviewVisit.reviewedSha,
          at: schema.reviewVisit.updatedAt,
        })
        .from(schema.reviewVisit)
        .where(
          and(
            eq(schema.reviewVisit.userId, ctx.user.id),
            eq(schema.reviewVisit.repo, repoRow.fullName),
            eq(schema.reviewVisit.prNumber, input.number),
          ),
        );
      const identity = await githubIdentity(ctx.user.id);
      const [external] = identity
        ? await db
            .select({
              sha: schema.prReview.commitSha,
              at: schema.prReview.submittedAt,
            })
            .from(schema.prReview)
            .where(
              and(
                eq(schema.prReview.repoId, repoRow.id),
                eq(schema.prReview.prNumber, input.number),
                sql`lower(${schema.prReview.reviewerLogin}) = ${identity.login.toLowerCase()}`,
                sql`${schema.prReview.state} NOT IN ('PENDING', 'DISMISSED')`,
              ),
            )
            .orderBy(desc(schema.prReview.submittedAt))
            .limit(1)
        : [];
      const sha =
        visit && (!external || visit.at >= external.at)
          ? visit.sha
          : external?.sha;
      const paid = (await workspacePlan(repoRow.workspaceId)) === "team";
      if (!sha)
        return {
          reviewedSha: null,
          files: null,
          changes: null,
          complete: false,
          paid,
        };
      const { headSha } = await headShaOf(repoRow.id, input.number);
      if (sha === headSha)
        return {
          reviewedSha: sha,
          files: [] as string[],
          changes: [],
          complete: true,
          paid,
        };
      const { installationId } = await repoDetails(repoRow.id);
      try {
        const cmp = await installationClient(installationId).compare(
          repoRow.fullName,
          sha,
          headSha,
        );
        // GitHub limits comparison file lists to 300. A diverged baseline cannot prove complete changes.
        if (
          !cmp.files ||
          cmp.files.length >= 300 ||
          !["ahead", "identical"].includes(cmp.status)
        )
          return {
            reviewedSha: sha,
            files: null,
            changes: null,
            complete: false,
            paid,
          };
        return {
          reviewedSha: sha,
          files: cmp.files.flatMap((f) =>
            f.previous_filename
              ? [f.filename, f.previous_filename]
              : [f.filename],
          ),
          changes: paid
            ? cmp.files.map((f) => ({
                path: f.filename,
                previousPath: f.previous_filename ?? null,
                status: f.status,
                patch: f.patch ?? null,
              }))
            : null,
          complete: true,
          paid,
        };
      } catch {
        return {
          reviewedSha: sha,
          files: null,
          changes: null,
          complete: false,
          paid,
        };
      }
    }),
  /** Whole file at the PR head, for "show full file". */
  fileContent: protectedProcedure
    .input(pr.extend({ path: z.string() }))
    .query(async ({ ctx, input }) => {
      const repoRow = await repoForUser(ctx.user.id, input.repo);
      const { headSha } = await headShaOf(repoRow.id, input.number);
      const { installationId } = await repoDetails(repoRow.id);
      const text = await installationClient(installationId)
        .fileContent(repoRow.fullName, input.path, headSha)
        .catch(githubFailure);
      if (text.length > 1_000_000)
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "File is too large to show",
        });
      return { text };
    }),
  /**
   * Who last changed each line before this PR. Old-side line numbers in a diff refer to the
   * merge base, so that's where we blame. Cached per commit: history under a sha never changes.
   * ponytail: in-memory per process, capped; move to Postgres if blame gets heavy use.
   */
  blame: protectedProcedure
    .input(pr.extend({ path: z.string().min(1).max(500) }))
    .query(async ({ ctx, input }) => {
      const repoRow = await repoForUser(ctx.user.id, input.repo);
      const [p] = await db
        .select({
          headSha: schema.pullRequest.headSha,
          baseRef: schema.pullRequest.baseRef,
        })
        .from(schema.pullRequest)
        .where(
          and(
            eq(schema.pullRequest.repoId, repoRow.id),
            eq(schema.pullRequest.number, input.number),
          ),
        );
      if (!p)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pull request not synced yet",
        });
      const { installationId } = await repoDetails(repoRow.id);
      const gh = installationClient(installationId);
      try {
        const baseKey = `${repoRow.fullName}#${input.number}@${p.headSha}`;
        let base = mergeBases.get(baseKey);
        if (!base) {
          base = (await gh.compare(repoRow.fullName, p.baseRef, p.headSha))
            .merge_base_commit?.sha;
          if (base) remember(mergeBases, baseKey, base);
        }
        if (!base) return { ranges: [] as BlameRange[] };
        const key = `${repoRow.fullName}@${base}:${input.path}`;
        let ranges = blameCache.get(key);
        if (!ranges) {
          ranges = (await gh.blame(repoRow.fullName, base, input.path)).slice(
            0,
            5000,
          );
          remember(blameCache, key, ranges);
        }
        return { ranges };
      } catch (err) {
        return githubFailure(err);
      }
    }),
};
