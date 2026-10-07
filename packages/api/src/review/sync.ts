import { db, schema } from "@docks/db";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { assertCan, audit } from "../access.js";
import { enqueue } from "../jobs.js";
import { enabledRepoCount, PLAN_LIMITS, workspacePlan } from "../plans.js";
import { columnOf, latestVerdicts } from "./columns.js";
import { getInstallation, installationClient } from "./github.js";
import { suggestReviewers } from "./reviewers.js";
import { scheduleUserRepoSync } from "./github-user.js";
import { tierOf } from "./risk.js";

/** plan.md §7 — keeps the Postgres mirror in step with GitHub. */

/**
 * Link a fresh installation to a workspace, then backfill its repos.
 * `userId` is the signed-in user returning from GitHub; they must be a member.
 */
export async function linkInstallation(
  userId: string,
  installationId: number,
  workspaceId: string,
) {
  await assertCan(userId, workspaceId, "integrations.manage");
  const inst = await getInstallation(installationId);
  await db
    .insert(schema.githubInstallation)
    .values({
      id: inst.id,
      workspaceId,
      accountLogin: inst.account.login,
      accountType: inst.account.type,
      suspendedAt: inst.suspended_at ? new Date(inst.suspended_at) : null,
    })
    .onConflictDoUpdate({
      target: schema.githubInstallation.id,
      set: { workspaceId, accountLogin: inst.account.login, suspendedAt: null },
    });
  await audit(workspaceId, userId, "github.install", inst.account.login);
  await syncInstallationRepos(installationId);
  // New repos: refresh members' GitHub access so they can open them.
  const members = await db
    .select({ userId: schema.workspaceMember.userId })
    .from(schema.workspaceMember)
    .where(eq(schema.workspaceMember.workspaceId, workspaceId));
  await scheduleUserRepoSync(members.map((m) => m.userId));
}

/** Upsert the repos the installation can see, drop removed ones, queue backfill. */
export async function syncInstallationRepos(installationId: number) {
  const repos = await installationClient(installationId).listRepos();
  const [inst] = await db
    .select({ workspaceId: schema.githubInstallation.workspaceId })
    .from(schema.githubInstallation)
    .where(eq(schema.githubInstallation.id, installationId))
    .limit(1);
  if (!inst) return;
  // Free plan: repos beyond the limit arrive switched off (plan.md §11).
  const limit = PLAN_LIMITS[await workspacePlan(inst.workspaceId)].repos;
  let enabledCount = await enabledRepoCount(inst.workspaceId);
  const known = new Set(
    (
      await db
        .select({ id: schema.repository.id })
        .from(schema.repository)
        .where(eq(schema.repository.installationId, installationId))
    ).map((r) => r.id),
  );

  for (const r of repos) {
    const isNew = !known.has(r.id);
    const enabled = isNew ? enabledCount < limit : undefined;
    if (enabled) enabledCount++;
    const [row] = await db
      .insert(schema.repository)
      .values({
        id: r.id,
        installationId,
        fullName: r.full_name,
        defaultBranch: r.default_branch,
        enabled: enabled ?? false,
      })
      .onConflictDoUpdate({
        target: schema.repository.id,
        set: { installationId, fullName: r.full_name, defaultBranch: r.default_branch },
      })
      .returning({ enabled: schema.repository.enabled });
    if (row?.enabled) await enqueue("sync_repo", { repoId: r.id });
  }
  const ids = repos.map((r) => r.id);
  await db
    .delete(schema.repository)
    .where(
      ids.length
        ? and(
            eq(schema.repository.installationId, installationId),
            notInArray(schema.repository.id, ids),
          )
        : eq(schema.repository.installationId, installationId),
    );
}

async function loadRepo(repoId: number) {
  const [repo] = await db
    .select()
    .from(schema.repository)
    .where(eq(schema.repository.id, repoId))
    .limit(1);
  return repo;
}

/** Queue a sync for every open PR; mark mirrored PRs that are no longer open. */
export async function syncRepo(repoId: number) {
  const repo = await loadRepo(repoId);
  if (!repo?.enabled) return;
  const pulls = await installationClient(repo.installationId).listOpenPulls(repo.fullName);
  for (const p of pulls) await enqueue("sync_pr", { repoId, number: p.number });

  const open = pulls.map((p) => p.number);
  const stale = await db
    .select({ number: schema.pullRequest.number })
    .from(schema.pullRequest)
    .where(
      and(
        eq(schema.pullRequest.repoId, repoId),
        eq(schema.pullRequest.state, "open"),
        ...(open.length ? [notInArray(schema.pullRequest.number, open)] : []),
      ),
    );
  for (const s of stale) await enqueue("sync_pr", { repoId, number: s.number });
}

/** Full refresh of one PR: pull, reviews, checks, files, then column. */
export async function syncPr(repoId: number, number: number) {
  const repo = await loadRepo(repoId);
  if (!repo?.enabled) return;
  const gh = installationClient(repo.installationId);
  const pr = await gh.getPull(repo.fullName, number);
  const [reviews, checks, files] = await Promise.all([
    gh.listReviews(repo.fullName, number),
    gh.listChecks(repo.fullName, pr.head.sha),
    pr.state === "open" ? gh.listFiles(repo.fullName, number) : Promise.resolve([]),
  ]);

  const mirroredReviews = reviews
    .filter((r) => r.user && r.submitted_at)
    .map((r) => ({
      id: r.id,
      repoId,
      prNumber: number,
      reviewerLogin: r.user!.login,
      state: r.state,
      submittedAt: new Date(r.submitted_at!),
    }));

  const column = columnOf(pr.requested_reviewers.length, latestVerdicts(mirroredReviews));
  const lastActivityAt = new Date(
    Math.max(
      new Date(pr.updated_at).getTime(),
      ...mirroredReviews.map((r) => r.submittedAt.getTime()),
    ),
  );
  const state = pr.merged_at ? "merged" : pr.state;

  await db.transaction(async (tx) => {
    const values = {
      repoId,
      number,
      title: pr.title,
      body: pr.body,
      authorLogin: pr.user.login,
      state,
      draft: pr.draft,
      headRef: pr.head.ref,
      headSha: pr.head.sha,
      baseRef: pr.base.ref,
      additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0,
      changedFiles: pr.changed_files ?? 0,
      requestedReviewers: pr.requested_reviewers.map((u) => u.login),
      labels: pr.labels.map((l) => l.name),
      mergeableState: pr.mergeable_state ?? null,
      reviewColumn: column,
      lastActivityAt,
    } as const;
    await tx
      .insert(schema.pullRequest)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.pullRequest.repoId, schema.pullRequest.number],
        set: values,
      });

    await tx
      .delete(schema.prReview)
      .where(and(eq(schema.prReview.repoId, repoId), eq(schema.prReview.prNumber, number)));
    if (mirroredReviews.length) await tx.insert(schema.prReview).values(mirroredReviews);

    await tx
      .delete(schema.prCheck)
      .where(and(eq(schema.prCheck.repoId, repoId), eq(schema.prCheck.headSha, pr.head.sha)));
    // A re-run check keeps its name; keep only the latest run per name.
    const latestChecks = new Map(checks.map((c) => [c.name, c]));
    if (latestChecks.size) {
      await tx.insert(schema.prCheck).values(
        [...latestChecks.values()].map((c) => ({
          repoId,
          headSha: pr.head.sha,
          name: c.name,
          status: c.status,
          conclusion: c.conclusion,
          updatedAt: new Date(c.completed_at ?? c.started_at ?? Date.now()),
        })),
      );
    }

    // Files are kept per head SHA (plan.md §8); patches only for open PRs.
    await tx
      .delete(schema.prFile)
      .where(
        and(
          eq(schema.prFile.repoId, repoId),
          eq(schema.prFile.prNumber, number),
          eq(schema.prFile.headSha, pr.head.sha),
        ),
      );
    if (files.length) {
      await tx.insert(schema.prFile).values(
        files.map((f) => ({
          repoId,
          prNumber: number,
          headSha: pr.head.sha,
          path: f.filename,
          blobSha: f.sha,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
          tier: tierOf(f.filename),
                })),
      );
    }
  });

  // New, ready PR with nobody asked to review: auto-assign once if the repo wants it (plan M4).
  const [pullRow] = await db
    .select({ autoAssignedAt: schema.pullRequest.autoAssignedAt })
    .from(schema.pullRequest)
    .where(and(eq(schema.pullRequest.repoId, repoId), eq(schema.pullRequest.number, number)));
  if (
    repo.autoAssign > 0 &&
    state === "open" &&
    !pr.draft &&
    pr.requested_reviewers.length === 0 &&
    mirroredReviews.length === 0 &&
    !pullRow?.autoAssignedAt
  ) {
    await enqueue("auto_assign", { repoId, number });
  }

  // New head commit with files: queue the AI guide (plan.md §6.3).
  if (state === "open" && !pr.draft && files.length && repo.aiEnabled) {
    await enqueue("generate_guide", { repoId, number, headSha: pr.head.sha });
  }
}

/**
 * Retention (plan.md §10): drop stored patches 30 days after a PR closes.
 * File names and counts stay for history; the code itself doesn't.
 * The row's updated_at is set when sync marks the PR closed or merged.
 */
export async function purgeOldPatches() {
  const result = await db.execute(sql`
    UPDATE ${schema.prFile} f SET patch = NULL
    FROM ${schema.pullRequest} p
    WHERE f.repo_id = p.repo_id AND f.pr_number = p.number
      AND p.state <> 'open'
      AND p.updated_at < now() - interval '30 days'
      AND f.patch IS NOT NULL
  `);
  return result.rowCount ?? 0;
}

/** Job body: request the top N suggested reviewers as the App, at most once per PR. */
export async function runAutoAssign(repoId: number, number: number) {
  const repo = await loadRepo(repoId);
  if (!repo?.enabled || repo.autoAssign <= 0) return;
  const claimed = await db
    .update(schema.pullRequest)
    .set({ autoAssignedAt: new Date() })
    .where(
      and(
        eq(schema.pullRequest.repoId, repoId),
        eq(schema.pullRequest.number, number),
        isNull(schema.pullRequest.autoAssignedAt),
      ),
    )
    .returning({ number: schema.pullRequest.number });
  if (!claimed.length) return; // another run got here first
  const picks = (await suggestReviewers(repoId, number))
    .filter((s) => !s.atLimit)
    .slice(0, repo.autoAssign)
    .map((s) => s.login);
  if (!picks.length) return;
  await installationClient(repo.installationId).requestReviewers(repo.fullName, number, picks);
  await syncPr(repoId, number);
}
