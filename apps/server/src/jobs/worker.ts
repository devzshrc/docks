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
import { applyRules } from "./handlers/apply-rules.js";
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
  apply_rules: applyRules,
};

const IDLE_MS = 2_000;
const SCHEDULE_MS = 60_000;

const logErr = (what: string) => (err: unknown) =>
  console.error(`[jobs] ${what} failed: ${(err as Error).message}`);

/** Runs one claimed job; returns false when the queue was empty. */
async function runNext(): Promise<boolean> {
  let job: Job | null = null;
  try {
    job = await claimNextJob();
    if (!job) return false;
    await handlers[job.type](job.payload);
    await completeJob(job.id);
  } catch (err) {
    if (job) {
      console.error(`[jobs] ${job.type}#${job.id} failed: ${(err as Error).message}`);
      await failJob(job, err).catch(() => {});
    } else {
      console.error(`[jobs] poll failed: ${(err as Error).message}`);
      return false;
    }
  }
  return true;
}

/** Drains the queue until it is empty or the time budget is spent (Workers cron / waitUntil). */
export async function drainQueue(budgetMs: number): Promise<void> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline && (await runNext())) {
    /* keep going */
  }
}

/**
 * Time-based schedulers, called once a minute. Hourly and 6-hourly work is keyed off
 * the clock so it is safe to call from a stateless cron.
 */
export async function runSchedules(now: Date = new Date()): Promise<void> {
  const tasks: Promise<unknown>[] = [scheduleDigests().catch(logErr("digest scheduling"))];
  if (now.getUTCMinutes() === 0) {
    // Retention: hourly is plenty for a 30-day rule.
    tasks.push(purgeOldPatches().catch(logErr("patch retention")));
    tasks.push(scheduleWeeklyReports().catch(logErr("weekly report scheduling")));
    // GitHub access drifts (people join/leave repos on GitHub): refresh every 6h.
    if (now.getUTCHours() % 6 === 0) tasks.push(scheduleUserRepoSync().catch(logErr("access sync scheduling")));
  }
  await Promise.all(tasks);
}

/** Node poll loop (local dev / single-instance hosting); returns a stop function. */
export function startWorker(): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  async function tick() {
    if (stopped) return;
    const worked = await runNext();
    // Drain the queue quickly while there is work; back off when idle.
    timer = setTimeout(tick, worked ? 0 : IDLE_MS);
  }

  const schedule = setInterval(() => void runSchedules(), SCHEDULE_MS);
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(schedule);
  };
}
