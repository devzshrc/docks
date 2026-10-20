import { db, schema } from "@docks/db";
import { and, eq, gte, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { assertMember, can, visibleRepos } from "../access.js";
import { cached } from "../cache.js";
import { insightsFromSql } from "../insights-sql.js";
import { protectedProcedure, router } from "../trpc.js";

/** Load mirrored PRs and reviews for a set of repos since a date. */
export async function insightRows(repos: { id: number; fullName: string }[], since: Date) {
  if (!repos.length) return { prs: [], reviews: [] };
  const name = new Map(repos.map((r) => [r.id, r.fullName]));
  const ids = repos.map((r) => r.id);
  const [prRows, reviewRows] = await Promise.all([
    db
      .select({
        repoId: schema.pullRequest.repoId,
        number: schema.pullRequest.number,
        authorLogin: schema.pullRequest.authorLogin,
        ghCreatedAt: schema.pullRequest.ghCreatedAt,
        mergedAt: schema.pullRequest.mergedAt,
        firstReviewAt: schema.pullRequest.firstReviewAt,
        additions: schema.pullRequest.additions,
        deletions: schema.pullRequest.deletions,
      })
      .from(schema.pullRequest)
      .where(
        and(
          inArray(schema.pullRequest.repoId, ids),
          or(gte(schema.pullRequest.ghCreatedAt, since), gte(schema.pullRequest.mergedAt, since)),
        ),
      ),
    db
      .select({
        repoId: schema.prReview.repoId,
        prNumber: schema.prReview.prNumber,
        reviewerLogin: schema.prReview.reviewerLogin,
        submittedAt: schema.prReview.submittedAt,
      })
      .from(schema.prReview)
      .where(and(inArray(schema.prReview.repoId, ids), gte(schema.prReview.submittedAt, since))),
  ]);
  return {
    prs: prRows.map((p) => ({ ...p, repo: name.get(p.repoId)! })),
    reviews: reviewRows.map((r) => ({ ...r, repo: name.get(r.repoId)! })),
  };
}

export const insightsRouter = router({
  summary: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        days: z.number().int().min(7).max(90).default(30),
        repoId: z.number().optional(),
        teamId: z.string().optional(),
        perPerson: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const member = await assertMember(ctx.user.id, input.workspaceId);
      // Per-person numbers are for admins only, and only when asked for (plan M7).
      const perPerson = input.perPerson && can(member.role, "members.manage");
      const repos = (await visibleRepos(ctx.user.id, input.workspaceId, member.repoIds)).filter(
        (r) => !input.repoId || r.id === input.repoId,
      );
      const to = new Date();
      const from = new Date(to.getTime() - input.days * 24 * 3_600_000);
      const teamLogins = input.teamId
        ? (
            await db
              .select({ login: schema.githubIdentity.githubLogin })
              .from(schema.teamMember)
              .innerJoin(schema.githubIdentity, eq(schema.githubIdentity.userId, schema.teamMember.userId))
              .where(eq(schema.teamMember.teamId, input.teamId))
          ).map((r) => r.login)
        : null;
      const key = JSON.stringify(["insights", repos.map((r) => r.id), input.days, teamLogins, perPerson]);
      const insights = await cached(key, 300_000, () => insightsFromSql(repos, { from, to, perPerson, teamLogins }));

      return {
        ...insights,
        canSeePeople: can(member.role, "members.manage"),
        repoOptions: repos.map((r) => ({ id: r.id, fullName: r.fullName })),
      };
    }),
});
