import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { repoForUser } from "../../access.js";
import { decrypt } from "../../crypto.js";
import { linearIssues } from "../../linear.js";
import { issueFromBranch, issueMentions, linearIdFromBranch, linearIds } from "../../review/links.js";
import { type GhIssue, installationClient } from "../../review/github.js";
import { protectedProcedure } from "../../trpc.js";
import { pr, repoDetails } from "./shared.js";

/** Linked issues and follow-ups. */
export const linksProcedures = {
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
};
