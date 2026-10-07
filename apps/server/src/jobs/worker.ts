/**
 * Job worker — plan.md §7.
 * Polls the `jobs` table (claim uses FOR UPDATE SKIP LOCKED), dispatches by
 * type, retries with exponential backoff (max 5 attempts, see failJob).
 */
import {
  claimNextJob,
  completeJob,
  failJob,
  purgeOldPatches,
  scheduleDigests,
  scheduleUserRepoSync,
  scheduleWeeklyReports,
  type Job,
} from "@docks/api";
import { autoAssign } from "./handlers/auto-assign.js";
import { generateGuide } from "./handlers/generate-guide.js";
import { slackDigest } from "./handlers/slack-digest.js";
import { syncPr } from "./handlers/sync-pr.js";
import { syncRepo } from "./handlers/sync-repo.js";
import { syncUserRepos } from "./handlers/sync-user-repos.js";
import { weeklyReport } from "./handlers/weekly-report.js";

export const handlers: Record<Job["type"], (payload: unknown) => Promise<void>> = {
  sync_repo: syncRepo,
  sync_pr: syncPr,
  generate_guide: generateGuide,
  slack_digest: slackDigest,
  sync_user_repos: syncUserRepos,
  auto_assign: autoAssign,
  weekly_report: weeklyReport,
};

const IDLE_MS = 2_000;
const SCHEDULE_MS = 60_000;

/** Starts the poll loop; returns a stop function. */
export function startWorker(): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  async function tick() {
    if (stopped) return;
    let job: Job | null = null;
    try {
      job = await claimNextJob();
      if (job) {
        await handlers[job.type](job.payload);
        await completeJob(job.id);
      }
    } catch (err) {
      if (job) {
        console.error(`[jobs] ${job.type}#${job.id} failed: ${(err as Error).message}`);
        await failJob(job, err).catch(() => {});
      } else {
        console.error(`[jobs] poll failed: ${(err as Error).message}`);
      }
    }
    // Drain the queue quickly while there is work; back off when idle.
    timer = setTimeout(tick, job ? 0 : IDLE_MS);
  }

  // Daily Slack digests: check every minute which workspaces are due.
  const schedule = setInterval(() => {
    scheduleDigests().catch((err) =>
      console.error(`[jobs] digest scheduling failed: ${(err as Error).message}`),
    );
  }, SCHEDULE_MS);

  // GitHub access drifts (people join/leave repos on GitHub): refresh every 6h.
  const access = setInterval(() => {
    scheduleUserRepoSync().catch((err) =>
      console.error(`[jobs] access sync scheduling failed: ${(err as Error).message}`),
    );
  }, 6 * 60 * 60_000);

  // Retention: hourly is plenty for a 30-day rule.
  const retention = setInterval(() => {
    purgeOldPatches().catch((err) =>
      console.error(`[jobs] patch retention failed: ${(err as Error).message}`),
    );
    scheduleWeeklyReports().catch((err) =>
      console.error(`[jobs] weekly report scheduling failed: ${(err as Error).message}`),
    );
  }, 60 * 60_000);

  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(schedule);
    clearInterval(retention);
    clearInterval(access);
  };
}
