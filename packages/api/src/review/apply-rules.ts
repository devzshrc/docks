import { db, schema, type RoutingRule } from "@docks/db";
import { and, eq, sql } from "drizzle-orm";
import { installationClient } from "./github.js";
import { dueRules } from "./rules.js";

const FOOTER = "\n\n<sub>Posted by a Docks routing rule.</sub>";

/** GitHub logins of a team's members who aren't away (members without a linked GitHub account are skipped). */
async function teamLogins(teamId: string, workspaceId: string) {
  const rows = await db
    .select({ login: schema.githubIdentity.githubLogin, away: schema.workspaceMember.awayUntil })
    .from(schema.team)
    .innerJoin(schema.teamMember, eq(schema.teamMember.teamId, schema.team.id))
    .innerJoin(schema.githubIdentity, eq(schema.githubIdentity.userId, schema.teamMember.userId))
    .innerJoin(
      schema.workspaceMember,
      and(eq(schema.workspaceMember.userId, schema.teamMember.userId), eq(schema.workspaceMember.workspaceId, workspaceId)),
    )
    .where(and(eq(schema.team.id, teamId), eq(schema.team.workspaceId, workspaceId)));
  const today = new Date().toISOString().slice(0, 10);
  return rows.filter((r) => !r.away || String(r.away) < today).map((r) => r.login);
}

/**
 * Job body: apply each routing rule that matches an open PR, once per PR.
 * A rule is claimed (recorded on the PR) before its actions run so a retry or a second
 * worker can't double-comment; if its actions fail the claim is released and the job retries.
 */
export async function runApplyRules(repoId: number, number: number) {
  const [repo] = await db
    .select({
      fullName: schema.repository.fullName,
      installationId: schema.repository.installationId,
      enabled: schema.repository.enabled,
      rules: schema.repository.routingRules,
      workspaceId: schema.githubInstallation.workspaceId,
    })
    .from(schema.repository)
    .innerJoin(schema.githubInstallation, eq(schema.githubInstallation.id, schema.repository.installationId))
    .where(eq(schema.repository.id, repoId));
  if (!repo?.enabled || !repo.rules.length) return;

  const [pr] = await db
    .select()
    .from(schema.pullRequest)
    .where(and(eq(schema.pullRequest.repoId, repoId), eq(schema.pullRequest.number, number)));
  if (!pr || pr.state !== "open" || pr.draft) return;

  const files = await db
    .select({ path: schema.prFile.path })
    .from(schema.prFile)
    .where(and(eq(schema.prFile.repoId, repoId), eq(schema.prFile.prNumber, number), eq(schema.prFile.headSha, pr.headSha)));
  const due = dueRules(repo.rules, pr.appliedRules, { paths: files.map((f) => f.path), lines: pr.additions + pr.deletions });
  if (!due.length) return;

  const gh = installationClient(repo.installationId);
  let changed = false;
  for (const rule of due) {
    const claimed = await db
      .update(schema.pullRequest)
      .set({ appliedRules: sql`array_append(${schema.pullRequest.appliedRules}, ${rule.id})` })
      .where(
        and(
          eq(schema.pullRequest.repoId, repoId),
          eq(schema.pullRequest.number, number),
          sql`NOT (${rule.id} = ANY(${schema.pullRequest.appliedRules}))`,
        ),
      )
      .returning({ n: schema.pullRequest.number });
    if (!claimed.length) continue; // another run got here first
    try {
      await perform(rule, gh, repo.fullName, number, repo.workspaceId, pr);
      changed = true;
    } catch (err) {
      await db
        .update(schema.pullRequest)
        .set({ appliedRules: sql`array_remove(${schema.pullRequest.appliedRules}, ${rule.id})` })
        .where(and(eq(schema.pullRequest.repoId, repoId), eq(schema.pullRequest.number, number)));
      throw err;
    }
  }
  return changed;
}

async function perform(
  rule: RoutingRule,
  gh: ReturnType<typeof installationClient>,
  fullName: string,
  number: number,
  workspaceId: string,
  pr: { authorLogin: string; requestedReviewers: string[] },
) {
  if (rule.label) await gh.addLabels(fullName, number, [rule.label]);
  const logins = new Set(rule.reviewers);
  if (rule.teamId) for (const l of await teamLogins(rule.teamId, workspaceId)) logins.add(l);
  const reviewers = [...logins].filter((l) => l !== pr.authorLogin && !pr.requestedReviewers.includes(l));
  if (reviewers.length) await gh.requestReviewers(fullName, number, reviewers);
  if (rule.comment) await gh.commentOnPr(fullName, number, rule.comment + FOOTER);
}

