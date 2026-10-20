import { randomUUID } from "node:crypto";
import { trackDaily } from "../../analytics.js";
import { db, schema } from "@docks/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { assertMember, audit, repoForAction } from "../../access.js";
import { boardFilters, filterBoard, sizeOf } from "../../review/board.js";
import { githubFailure } from "../../review/errors.js";
import { githubAs, githubIdentity } from "../../review/github-user.js";
import type { BoardCard } from "../../review/types.js";
import { protectedProcedure } from "../../trpc.js";
import { pr, refreshPr } from "./shared.js";

/** Board, labels, priority and saved views. */
export const boardProcedures = {
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
};
