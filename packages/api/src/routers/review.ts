import { diffCitations } from "../review/ask-context.js";
import { logError } from "../logger.js";
import { workspacePlan } from "../plans.js";
import { randomUUID } from "node:crypto";
import { track, trackDaily } from "../analytics.js";
import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  assertMember,
  audit,
  can,
  repoForAction,
  repoForUser,
} from "../access.js";
import { enqueue } from "../jobs.js";
import { boardFilters, filterBoard, sizeOf } from "../review/board.js";
import { latestVerdicts } from "../review/columns.js";
import { askPr } from "../review/ask.js";
import { decrypt } from "../crypto.js";
import { linearIssues } from "../linear.js";
import {
  issueFromBranch,
  issueMentions,
  linearIdFromBranch,
  linearIds,
} from "../review/links.js";
import { githubFailure } from "../review/errors.js";
import {
  type BlameRange,
  type GhIssue,
  installationClient,
} from "../review/github.js";
import { TOO_LARGE_REASON, fallbackGuide, guideKey, tooLargeForGuide } from "../review/guide.js";
import { githubAs, githubIdentity } from "../review/github-user.js";
import { loginsToUsers, suggestReviewers } from "../review/reviewers.js";
import { emptySession, sessionData } from "../review/session.js";
import { computeMergeReadiness } from "../review/merge-readiness.js";
import { syncPr } from "../review/sync.js";
import type {
  BoardCard,
  Guide,
  RankedFile,
  RiskTier,
} from "../review/types.js";
import { protectedProcedure, router } from "../trpc.js";

const TIER_ORDER: Record<RiskTier, number> = {
  core: 0,
  config: 1,
  test: 2,
  noise: 3,
};

/** Refresh the mirror right away so the UI reflects the action; webhook is the backstop. */
async function refreshPr(repoId: number, number: number) {
  try {
    await syncPr(repoId, number);
  } catch {
    await enqueue("sync_pr", { repoId, number });
  }
}

export type GuideState =
  | { status: "pending" }
  | { status: "ready"; guide: Guide; model: string | null };

/** Must match the key order used by syncPr so enqueue() dedupes. */
const guideJobPayload = (repoId: number, number: number, headSha: string) => ({
  repoId,
  number,
  headSha,
});

async function loadPull(
  userId: string,
  input: { repo: string; number: number },
) {
  const repoRow = await repoForUser(userId, input.repo);
  const [pull] = await db
    .select({ headSha: schema.pullRequest.headSha })
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
  return { repoRow, pull };
}

async function guideState(
  userId: string,
  input: { repo: string; number: number },
): Promise<GuideState> {
  const { repoRow, pull } = await loadPull(userId, input);
  const [cached] = await db
    .select({
      guide: schema.reviewGuide.guide,
      model: schema.reviewGuide.model,
    })
    .from(schema.reviewGuide)
    .where(guideKey(repoRow.fullName, input.number, pull.headSha))
    .limit(1);
  if (cached) {
    void trackDaily(
      userId,
      repoRow.workspaceId,
      "guide_viewed",
      `${repoRow.fullName}#${input.number}`,
    );
    return {
      status: "ready",
      guide: cached.guide as Guide,
      model: cached.model,
    };
  }

  const files = await db
    .select({
      filename: schema.prFile.path,
      tier: schema.prFile.tier,
      additions: schema.prFile.additions,
      deletions: schema.prFile.deletions,
    })
    .from(schema.prFile)
    .where(
      and(
        eq(schema.prFile.repoId, repoRow.id),
        eq(schema.prFile.prNumber, input.number),
        eq(schema.prFile.headSha, pull.headSha),
      ),
    );
  const fallback = (reason: string): GuideState => ({
    status: "ready",
    guide: fallbackGuide(files, reason),
    model: null,
  });

  const [settings] = await db
    .select({ aiEnabled: schema.repository.aiEnabled })
    .from(schema.repository)
    .where(eq(schema.repository.id, repoRow.id))
    .limit(1);
  if (!settings?.aiEnabled) {
    return fallback(
      "The AI guide is off for this repository. Files are grouped by folder, riskiest first.",
    );
  }

  if (tooLargeForGuide(files)) return fallback(TOO_LARGE_REASON);

  // Lazy path: no job yet (e.g. guide turned on after the last push) -> queue one.
  const payload = guideJobPayload(repoRow.id, input.number, pull.headSha);
  const [job] = await db
    .select({ status: schema.jobs.status })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.type, "generate_guide"),
        sql`${schema.jobs.payload} = ${JSON.stringify(payload)}::jsonb`,
      ),
    )
    .orderBy(desc(schema.jobs.id))
    .limit(1);
  if (job?.status === "failed" || job?.status === "done") {
    // "done" without a cached guide means it was skipped (no files) or lost a race.
    return fallback(
      "The AI guide isn't available for this commit. Files are grouped by folder, riskiest first.",
    );
  }
  if (!job) await enqueue("generate_guide", payload);
  return { status: "pending" };
}

const lineComment = z.object({
  path: z.string(),
  line: z.number().int().positive(),
  side: z.enum(["LEFT", "RIGHT"]),
  startLine: z.number().int().positive().optional(),
  body: z.string().trim().min(1).max(65_000),
});

async function repoDetails(repoId: number) {
  const [r] = await db
    .select({
      installationId: schema.repository.installationId,
      checklistTemplate: schema.repository.checklistTemplate,
    })
    .from(schema.repository)
    .where(eq(schema.repository.id, repoId));
  if (!r)
    throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
  return r;
}

const checklistTemplateOf = async (repoId: number) =>
  (await repoDetails(repoId)).checklistTemplate;

async function headShaOf(repoId: number, number: number) {
  const [p] = await db
    .select({
      headSha: schema.pullRequest.headSha,
      title: schema.pullRequest.title,
      body: schema.pullRequest.body,
    })
    .from(schema.pullRequest)
    .where(
      and(
        eq(schema.pullRequest.repoId, repoId),
        eq(schema.pullRequest.number, number),
      ),
    );
  if (!p)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Pull request not synced yet",
    });
  return p;
}

async function recordVisit(
  userId: string,
  repoRow: { id: number; fullName: string },
  number: number,
  headSha: string,
) {
  await db
    .insert(schema.reviewVisit)
    .values({
      userId,
      repo: repoRow.fullName,
      prNumber: number,
      reviewedSha: headSha,
    })
    .onConflictDoUpdate({
      target: [
        schema.reviewVisit.userId,
        schema.reviewVisit.repo,
        schema.reviewVisit.prNumber,
      ],
      set: { reviewedSha: headSha },
    });
}

const repo = z.string().regex(/^[\w.-]+\/[\w.-]+$/);
const pr = z.object({ repo, number: z.number().int().positive() });

const mergeBases = new Map<string, string>();
const blameCache = new Map<string, BlameRange[]>();
/** Insert, evicting the oldest entry past 300. */
function remember<V>(map: Map<string, V>, key: string, value: V) {
  if (map.size >= 300) map.delete(map.keys().next().value!);
  map.set(key, value);
}

export const reviewRouter = router({
  /**
   * The board across every repo the person can open (plan M5). Returns the
   * filtered cards plus the options the filter bar offers.
   */
  board: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        filters: boardFilters.default({ sort: "oldest" }),
      }),
    )
    .query(async ({ ctx, input }) => {
      const member = await assertMember(ctx.user.id, input.workspaceId);
      void trackDaily(ctx.user.id, input.workspaceId, "board_viewed");
      const [repos, visible, ws, identity] = await Promise.all([
        db
          .select({
            id: schema.repository.id,
            fullName: schema.repository.fullName,
          })
          .from(schema.repository)
          .innerJoin(
            schema.githubInstallation,
            eq(schema.githubInstallation.id, schema.repository.installationId),
          )
          .where(
            and(
              eq(schema.githubInstallation.workspaceId, input.workspaceId),
              eq(schema.repository.enabled, true),
            ),
          ),
        db
          .select({ repoId: schema.githubRepoAccess.repoId })
          .from(schema.githubRepoAccess)
          .where(eq(schema.githubRepoAccess.userId, ctx.user.id)),
        db
          .select({ stuckHours: schema.workspace.stuckHours })
          .from(schema.workspace)
          .where(eq(schema.workspace.id, input.workspaceId)),
        githubIdentity(ctx.user.id),
      ]);
      const onGithub = new Set(visible.map((v) => v.repoId));
      const mine = repos.filter(
        (r) =>
          onGithub.has(r.id) &&
          (!member.repoIds || member.repoIds.includes(r.id)),
      );
      const repoName = new Map(mine.map((r) => [r.id, r.fullName]));
      const empty = {
        cards: [] as BoardCard[],
        repos: mine,
        authors: [] as string[],
        labels: [] as string[],
        teams: [] as { id: string; name: string }[],
        stuckHours: ws[0]?.stuckHours ?? 24,
        me: identity?.login ?? null,
      };
      if (!mine.length) return empty;

      const pulls = await db
        .select()
        .from(schema.pullRequest)
        .where(
          and(
            inArray(schema.pullRequest.repoId, [...repoName.keys()]),
            eq(schema.pullRequest.state, "open"),
          ),
        );
      const checks = pulls.length
        ? await db
            .select({
              repoId: schema.prCheck.repoId,
              headSha: schema.prCheck.headSha,
              status: schema.prCheck.status,
              conclusion: schema.prCheck.conclusion,
            })
            .from(schema.prCheck)
            .where(
              inArray(
                schema.prCheck.headSha,
                pulls.map((p) => p.headSha),
              ),
            )
        : [];
      const ciOf = (repoId: number, sha: string): BoardCard["ci"] => {
        const runs = checks.filter(
          (c) => c.repoId === repoId && c.headSha === sha,
        );
        if (!runs.length) return "none";
        if (
          runs.some(
            (c) => c.conclusion === "failure" || c.conclusion === "timed_out",
          )
        )
          return "fail";
        if (runs.some((c) => c.status !== "completed")) return "pending";
        return "pass";
      };

      const teams = await db
        .select({ id: schema.team.id, name: schema.team.name })
        .from(schema.team)
        .where(eq(schema.team.workspaceId, input.workspaceId));
      let teamLogins: Set<string> | null = null;
      if (input.filters.teamId) {
        const rows = await db
          .select({ login: schema.githubIdentity.githubLogin })
          .from(schema.teamMember)
          .innerJoin(
            schema.githubIdentity,
            eq(schema.githubIdentity.userId, schema.teamMember.userId),
          )
          .where(eq(schema.teamMember.teamId, input.filters.teamId));
        teamLogins = new Set(rows.map((r) => r.login.toLowerCase()));
      }

      const claimerIds = [
        ...new Set(
          pulls.map((p) => p.claimedBy).filter((x): x is string => Boolean(x)),
        ),
      ];
      const claimers = new Map(
        claimerIds.length
          ? (
              await db
                .select({ id: schema.user.id, name: schema.user.name })
                .from(schema.user)
                .where(inArray(schema.user.id, claimerIds))
            ).map((u) => [u.id, u.name])
          : [],
      );
      const avatar = (l: string) => ({
        login: l,
        avatar_url: `https://github.com/${l}.png?size=40`,
      });
      const rows = filterBoard(
        pulls.map((p) => ({ ...p, ci: ciOf(p.repoId, p.headSha) })),
        input.filters,
        {
          me: identity?.login ?? null,
          teamLogins,
          stuckHours: ws[0]?.stuckHours ?? 24,
        },
      );

      return {
        ...empty,
        teams,
        authors: [...new Set(pulls.map((p) => p.authorLogin))].sort(),
        labels: [...new Set(pulls.flatMap((p) => p.labels))].sort(),
        cards: rows.map((p): BoardCard => ({
          repo: repoName.get(p.repoId)!,
          number: p.number,
          title: p.title,
          url: `https://github.com/${repoName.get(p.repoId)}/pull/${p.number}`,
          author: avatar(p.authorLogin),
          reviewers: p.requestedReviewers.map(avatar),
          column: p.column,
          stuck: p.stuck,
          updatedAt: p.lastActivityAt.toISOString(),
          additions: p.additions,
          deletions: p.deletions,
          ci: p.ci,
          claimedBy: p.claimedBy
            ? {
                userId: p.claimedBy,
                name: claimers.get(p.claimedBy) ?? "Someone",
              }
            : null,
          labels: p.labels,
          priority: p.priority,
          draft: p.draft,
          size: sizeOf(p),
        })),
      };
    }),

  /** App-only flag; doesn't touch GitHub. */
  setPriority: protectedProcedure
    .input(pr.extend({ priority: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const repoRow = await repoForAction(
        ctx.user.id,
        input.repo,
        "review.act",
      );
      await db
        .update(schema.pullRequest)
        .set({ priority: input.priority })
        .where(
          and(
            eq(schema.pullRequest.repoId, repoRow.id),
            eq(schema.pullRequest.number, input.number),
          ),
        );
      await audit(
        repoRow.workspaceId,
        ctx.user.id,
        "review.priority",
        `${repoRow.fullName}#${input.number}`,
        { priority: input.priority },
      );
    }),

  /** Replace the PR's labels on GitHub, as the signed-in person. */
  setLabels: protectedProcedure
    .input(
      pr.extend({ labels: z.array(z.string().trim().min(1).max(50)).max(20) }),
    )
    .mutation(async ({ ctx, input }) => {
      const repoRow = await repoForAction(
        ctx.user.id,
        input.repo,
        "review.act",
      );
      await githubAs(ctx.user.id)
        .setLabels(repoRow.fullName, input.number, input.labels)
        .catch(githubFailure);
      await audit(
        repoRow.workspaceId,
        ctx.user.id,
        "review.labels",
        `${repoRow.fullName}#${input.number}`,
        { labels: input.labels },
      );
      await refreshPr(repoRow.id, input.number);
    }),

  savedViews: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMember(ctx.user.id, input.workspaceId);
      return db
        .select({
          id: schema.savedView.id,
          name: schema.savedView.name,
          query: schema.savedView.query,
        })
        .from(schema.savedView)
        .where(
          and(
            eq(schema.savedView.userId, ctx.user.id),
            eq(schema.savedView.workspaceId, input.workspaceId),
          ),
        )
        .orderBy(asc(schema.savedView.name));
    }),

  saveView: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().trim().min(1).max(60),
        query: z.string().max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.user.id, input.workspaceId);
      const id = randomUUID();
      await db
        .insert(schema.savedView)
        .values({ id, userId: ctx.user.id, ...input });
      return { id };
    }),

  deleteView: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(schema.savedView)
        .where(
          and(
            eq(schema.savedView.id, input.id),
            eq(schema.savedView.userId, ctx.user.id),
          ),
        );
    }),

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
      checklistTemplate: await checklistTemplateOf(repoRow.id),
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

  /** Issues this PR is linked to: GitHub (closing keywords, #n) and Linear (ENG-123) when connected. */
  linkedIssues: protectedProcedure.input(pr).query(async ({ ctx, input }) => {
    const repoRow = await repoForUser(ctx.user.id, input.repo);
    const [p] = await db
      .select({
        title: schema.pullRequest.title,
        body: schema.pullRequest.body,
        headRef: schema.pullRequest.headRef,
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

    const closing = await gh
      .closingIssues(repoRow.fullName, input.number)
      .catch(() => [] as GhIssue[]);
    const known = new Set(closing.map((i) => i.number));
    const mentioned = (
      await Promise.all(
        [
          ...new Set([
            ...(issueFromBranch(p.headRef)
              ? [issueFromBranch(p.headRef)!]
              : []),
            ...issueMentions(`${p.title}\n${p.body ?? ""}`, input.number),
          ]),
        ]
          .filter((n) => n !== input.number && !known.has(n))
          .slice(0, 5)
          .map((n) => gh.issue(repoRow.fullName, n).catch(() => null)),
      )
    ).flatMap((i) => (i ? [i] : []));

    const ids = [
      ...new Set(
        [linearIdFromBranch(p.headRef), ...linearIds(p.title, p.body)].filter(
          (x): x is string => Boolean(x),
        ),
      ),
    ].slice(0, 5);
    const [linear] = await db
      .select({ key: schema.linearIntegration.apiKeyEncrypted })
      .from(schema.linearIntegration)
      .where(eq(schema.linearIntegration.workspaceId, repoRow.workspaceId));
    const issues =
      linear && ids.length
        ? await linearIssues(decrypt(linear.key), ids).catch(() => [])
        : [];
    return {
      github: [
        ...closing.map((i) => ({ ...i, relation: "closes" as const })),
        ...mentioned.map((i) => ({ ...i, relation: "mentioned" as const })),
      ],
      linear: issues,
      linearConnected: Boolean(linear),
      // Looks like Linear ids but nothing to look them up with.
      linearHint: linear ? [] : ids,
    };
  }),

  followUps: protectedProcedure.input(pr).query(async ({ ctx, input }) => {
    const r = await repoForUser(ctx.user.id, input.repo);
    const rows = await db
      .select({
        link: schema.reviewFollowUp,
        repo: schema.repository.fullName,
        title: schema.issue.title,
        state: schema.issue.state,
      })
      .from(schema.reviewFollowUp)
      .innerJoin(
        schema.repository,
        eq(schema.repository.id, schema.reviewFollowUp.targetRepoId),
      )
      .leftJoin(
        schema.issue,
        and(
          eq(schema.issue.repoId, schema.reviewFollowUp.targetRepoId),
          eq(schema.issue.number, schema.reviewFollowUp.issueNumber),
        ),
      )
      .where(
        and(
          eq(schema.reviewFollowUp.repoId, r.id),
          eq(schema.reviewFollowUp.prNumber, input.number),
        ),
      )
      .limit(100);
    const visible = [];
    for (const row of rows) {
      try {
        await repoForUser(ctx.user.id, row.repo);
        visible.push(row);
      } catch (err) {
        if (!(
          err instanceof TRPCError &&
          ["FORBIDDEN", "NOT_FOUND"].includes(err.code)
        ))
          throw err;
      }
    }
    return visible;
  }),

  questions: protectedProcedure.input(pr).query(async ({ ctx, input }) => {
    const r = await repoForUser(ctx.user.id, input.repo);
    const { headSha } = await headShaOf(r.id, input.number);
    const questions = await db
      .select()
      .from(schema.reviewQuestion)
      .where(
        and(
          eq(schema.reviewQuestion.userId, ctx.user.id),
          eq(schema.reviewQuestion.repoId, r.id),
          eq(schema.reviewQuestion.prNumber, input.number),
        ),
      )
      .orderBy(desc(schema.reviewQuestion.createdAt))
      .limit(50);
    return { headSha, questions: questions.reverse() };
  }),

  /** Ask a question about the PR; viewers can ask too. */
  ask: protectedProcedure
    .input(
      pr.extend({
        question: z.string().trim().min(1).max(2000),
        path: z.string().max(500).optional(),
        line: z.number().int().positive().optional(),
        knowledgeIds: z.array(z.string().uuid()).max(3).default([]),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().max(8000),
            }),
          )
          .max(20)
          .default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const repoRow = await repoForUser(ctx.user.id, input.repo);
      const { headSha, title, body } = await headShaOf(
        repoRow.id,
        input.number,
      );
      const files = await db
        .select({
          filename: schema.prFile.path,
          tier: schema.prFile.tier,
          patch: schema.prFile.patch,
          additions: schema.prFile.additions,
          deletions: schema.prFile.deletions,
        })
        .from(schema.prFile)
        .where(
          and(
            eq(schema.prFile.repoId, repoRow.id),
            eq(schema.prFile.prNumber, input.number),
            eq(schema.prFile.headSha, headSha),
          ),
        );
      try {
        const [aiRepo] = await db
          .select({ enabled: schema.repository.aiEnabled })
          .from(schema.repository)
          .where(eq(schema.repository.id, repoRow.id));
        if (!aiRepo?.enabled)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "AI is disabled for this repository",
          });
        const scoped = input.path
          ? files.filter((f) => f.filename === input.path)
          : files;
        if (!scoped.length)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No diff is available for this selection yet",
          });
        if (
          input.line &&
          (!input.path ||
            !diffCitations(`${input.path}:${input.line}`, scoped).length)
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a new-side line present in this diff",
          });
        const contextualQuestion = input.line
          ? `${input.question}\nFocus on ${input.path}:${input.line} on the new side of the diff.`
          : input.question;
        const knowledge = input.knowledgeIds.length
          ? await db
              .select()
              .from(schema.repositoryKnowledge)
              .where(
                and(
                  eq(schema.repositoryKnowledge.repoId, repoRow.id),
                  eq(schema.repositoryKnowledge.archived, false),
                  inArray(schema.repositoryKnowledge.id, input.knowledgeIds),
                ),
              )
          : [];
        if (knowledge.length !== input.knowledgeIds.length)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A selected knowledge document is unavailable",
          });
        const prior = await db
          .select()
          .from(schema.reviewQuestion)
          .where(
            and(
              eq(schema.reviewQuestion.userId, ctx.user.id),
              eq(schema.reviewQuestion.repoId, repoRow.id),
              eq(schema.reviewQuestion.prNumber, input.number),
              eq(schema.reviewQuestion.headSha, headSha),
              eq(schema.reviewQuestion.status, "completed"),
            ),
          )
          .orderBy(desc(schema.reviewQuestion.createdAt))
          .limit(5);
        const history = prior.reverse().flatMap((q) => [
          { role: "user" as const, content: q.question },
          { role: "assistant" as const, content: q.answer.slice(0, 8000) },
        ]);
        const reservation = await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ask:${ctx.user.id}`}, 0))`,
          );
          const [usage] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(schema.reviewQuestion)
            .where(
              and(
                eq(schema.reviewQuestion.userId, ctx.user.id),
                sql`${schema.reviewQuestion.createdAt} > now() - interval '1 hour'`,
              ),
            );
          if ((usage?.n ?? 0) >= 30)
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message:
                "You have reached 30 questions this hour. Try again later.",
            });
          const [row] = await tx
            .insert(schema.reviewQuestion)
            .values({
              userId: ctx.user.id,
              repoId: repoRow.id,
              prNumber: input.number,
              headSha,
              question: contextualQuestion,
              answer: "Answer pending",
              status: "pending",
              path: input.path,
              citations: [],
              knowledge: knowledge.map((k) => ({
                id: k.id,
                version: k.version,
                title: k.title,
              })),
            })
            .returning();
          return row!;
        });
        try {
          const answer = await askPr(
            {
              title,
              body,
              files: scoped,
              question: contextualQuestion,
              history,
              knowledge: knowledge.map((k) => ({
                ...k,
                body: k.body.slice(0, 6000),
              })),
            },
            { workspaceId: repoRow.workspaceId, repoId: repoRow.id },
          );
          const citations = diffCitations(answer, scoped);
          const [saved] = await db
            .update(schema.reviewQuestion)
            .set({
              answer,
              citations,
              status: "completed",
              updatedAt: new Date(),
            })
            .where(eq(schema.reviewQuestion.id, reservation.id))
            .returning();
          return saved!;
        } catch (err) {
          await db
            .update(schema.reviewQuestion)
            .set({
              answer: "This question failed. Ask again to retry.",
              status: "failed",
              updatedAt: new Date(),
            })
            .where(eq(schema.reviewQuestion.id, reservation.id));
          throw err;
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        logError("ask.failed", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Couldn't get an answer right now. Try again.",
        });
      }
    }),
});
