/**
 * Job worker — plan.md §7.
 * Polls the `jobs` table (claim uses FOR UPDATE SKIP LOCKED), dispatches by
 * type, retries with exponential backoff (max 5 attempts, see failJob).
 */
import {
  refreshReleaseReadiness,
  scheduleReviewDeadlines,
  processReviewDeadline,
  claimNextJob,
  completeJob,
  failJob,
  purgeOldPatches,
  expireStaleQuestions,
  purgeDiagnostics,
  processInboxEvent,
  scheduleDigests,
  scheduleUserRepoSync,
  scheduleWeeklyReports,
  type Job,
  logEvent,
  logError,
  withLogContext,
  inSpan,
} from "@docks/api";
import { applyRules } from "./handlers/apply-rules.js";
import { autoAssign } from "./handlers/auto-assign.js";
import { generateGuide } from "./handlers/generate-guide.js";
import { slackDigest } from "./handlers/slack-digest.js";
import { syncIssue, syncIssues } from "./handlers/sync-issues.js";
import { syncPr } from "./handlers/sync-pr.js";
import { syncRepo } from "./handlers/sync-repo.js";
import { syncUserRepos } from "./handlers/sync-user-repos.js";
import { weeklyReport } from "./handlers/weekly-report.js";

export const handlers: Record<
  Job["type"],
  (payload: unknown) => Promise<void>
> = {
  review_deadline: async (payload) =>
    processReviewDeadline((payload as { deliveryId: string }).deliveryId),
  release_readiness: async (payload) =>
    refreshReleaseReadiness(
      payload as {
        releaseId: string;
        repoId: number;
        number: number;
        userId: string;
      },
    ),
  inbox_event: async (payload) => {
    await processInboxEvent((payload as { eventId: string }).eventId);
  },
  sync_repo: syncRepo,
  sync_pr: syncPr,
  generate_guide: generateGuide,
  slack_digest: slackDigest,
  sync_user_repos: syncUserRepos,
  auto_assign: autoAssign,
  weekly_report: weeklyReport,
  apply_rules: applyRules,
  sync_issues: syncIssues,
  sync_issue: syncIssue,
};

const IDLE_MS = 2_000;
const SCHEDULE_MS = 60_000;

const logErr = (what: string) => (err: unknown) =>
  logError("scheduler.task_failed", err, { operation: what });

/** Runs one claimed job; returns false when the queue was empty. */
async function runNext(): Promise<boolean> {
  let job: Job | null = null;
  try {
    job = await claimNextJob();
    if (!job) return false;
    const claimed = job;
    await withLogContext(
      { jobId: claimed.id, requestId: claimed.requestId ?? undefined },
      async () => {
        const started = performance.now();
        try {
          await inSpan(`job.${claimed.type}`, () =>
            handlers[claimed.type](claimed.payload),
          );
          await completeJob(claimed.id);
          logEvent("info", "job.completed", {
            operation: claimed.type,
            attempts: claimed.attempts,
            durationMs: Math.round(performance.now() - started),
          });
        } catch (error) {
          logError("job.failed", error, {
            operation: claimed.type,
            attempts: claimed.attempts,
            durationMs: Math.round(performance.now() - started),
          });
          throw error;
        }
      },
    );
  } catch (err) {
    if (job) {
      logError("job.retrying", err, { jobId: job.id, operation: job.type });
      await failJob(job, err).catch((error) => {
        logError("job.state_update_failed", error, { jobId: job!.id });
        throw error;
      });
    } else {
      logError("jobs.poll_failed", err);
      throw err;
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
export async function runSchedules(now: Date = new Date()): Promise<boolean> {
  let healthy = true;
  const failed = (operation: string) => (error: unknown) => {
    healthy = false;
    logErr(operation)(error);
  };
  const tasks: Promise<unknown>[] = [
    scheduleReviewDeadlines(now).catch(failed("review deadline scheduling")),
    scheduleDigests().catch(failed("digest scheduling")),
    expireStaleQuestions(now).catch(failed("stale question expiry")),
  ];
  if (now.getUTCMinutes() === 0) {
    // Retention: hourly is plenty for a 30-day rule.
    tasks.push(purgeDiagnostics().catch(failed("diagnostic retention")));
    tasks.push(purgeOldPatches().catch(failed("patch retention")));
    tasks.push(
      scheduleWeeklyReports().catch(failed("weekly report scheduling")),
    );
    // GitHub access drifts (people join/leave repos on GitHub): refresh every 6h.
    if (now.getUTCHours() % 6 === 0)
      tasks.push(
        scheduleUserRepoSync().catch(failed("access sync scheduling")),
      );
  }
  await Promise.all(tasks);
  logEvent(healthy ? "info" : "error", "scheduler.completed", {
    outcome: healthy ? "ok" : "failed",
  });
  return healthy;
}

/** Node poll loop (local dev / single-instance hosting); returns a stop function. */
export function startWorker(): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  async function tick() {
    if (stopped) return;
    const worked = await runNext().catch(() => false);
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
