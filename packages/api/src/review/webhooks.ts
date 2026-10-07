import { db, schema } from "@docks/db";
import { eq } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { enqueue } from "../jobs.js";
import type { GhIssueRest } from "./github.js";
import { upsertIssue } from "./issues-sync.js";
import { syncInstallationRepos } from "./sync.js";

/** plan.md §9.2 — GitHub App webhook handling. */

export function verifyGithubSignature(rawBody: Buffer, signature: string | undefined) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`,
  );
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

interface Payload {
  action?: string;
  installation?: { id: number };
  repository?: { id: number };
  pull_request?: { number: number };
  issue?: GhIssueRest;
  check_run?: { pull_requests: { number: number }[] };
  check_suite?: { pull_requests: { number: number }[] };
}

const PR_EVENTS = new Set(["pull_request", "pull_request_review"]);

async function knownRepo(repoId: number) {
  const [repo] = await db
    .select({ enabled: schema.repository.enabled })
    .from(schema.repository)
    .where(eq(schema.repository.id, repoId))
    .limit(1);
  return repo?.enabled === true;
}

async function knownInstallation(id: number) {
  const [row] = await db
    .select({ id: schema.githubInstallation.id })
    .from(schema.githubInstallation)
    .where(eq(schema.githubInstallation.id, id))
    .limit(1);
  return Boolean(row);
}

/** Do the minimum inline; anything that calls GitHub per PR goes to the job queue. */
export async function handleGithubEvent(event: string, payload: Payload) {
  const installationId = payload.installation?.id;

  if (event === "installation" && installationId) {
    // "created" is linked to a workspace by the setup callback, not here.
    if (payload.action === "deleted") {
      await db
        .delete(schema.githubInstallation)
        .where(eq(schema.githubInstallation.id, installationId));
    } else if (payload.action === "suspend" || payload.action === "unsuspend") {
      await db
        .update(schema.githubInstallation)
        .set({ suspendedAt: payload.action === "suspend" ? new Date() : null })
        .where(eq(schema.githubInstallation.id, installationId));
    }
    return;
  }

  if (event === "installation_repositories" && installationId) {
    if (await knownInstallation(installationId)) await syncInstallationRepos(installationId);
    return;
  }

  const repoId = payload.repository?.id;
  if (!repoId || !(await knownRepo(repoId))) return;

  // Issue events carry the whole issue; store it without a round trip. (PRs also arrive as `issue_comment`.)
  if ((event === "issues" || event === "issue_comment") && payload.issue && !payload.issue.pull_request) {
    await upsertIssue(repoId, payload.issue);
    return;
  }

  if (PR_EVENTS.has(event) && payload.pull_request) {
    await enqueue("sync_pr", { repoId, number: payload.pull_request.number });
    return;
  }

  const prs = payload.check_run?.pull_requests ?? payload.check_suite?.pull_requests ?? [];
  for (const pr of prs) await enqueue("sync_pr", { repoId, number: pr.number });
}
