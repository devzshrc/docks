// Auth instance — used by apps/server (handler + session lookup).
// apps/web talks to it over HTTP via createAuthClient, never imports this.
export { auth } from "./auth.js";
export type { AuthUser, Session } from "./auth.js";

// Runtime entry — used by apps/server.
export { appRouter } from "./routers/_app.js";

// Type-only entry — used by apps/web via `import type { AppRouter }`.
export type { AppRouter } from "./routers/_app.js";

// Review domain — used by apps/server (webhooks, setup callback, job worker).
export { claimNextJob, completeJob, enqueue, failJob, PermanentJobError } from "./jobs.js";
export type { Job, JobType } from "./jobs.js";
export { handleGithubEvent, verifyGithubSignature } from "./review/webhooks.js";
export { linkInstallation, purgeOldPatches, runAutoAssign, syncPr, syncRepo } from "./review/sync.js";
export { completeAuthorization, scheduleUserRepoSync, syncUserRepos } from "./review/github-user.js";
export { generateGuideFor } from "./review/guide.js";
export { handleBillingWebhook } from "./billing.js";
export { scheduleWeeklyReports, sendWeeklyReport } from "./reports.js";
export { connectSlack, scheduleDigests, sendDigest } from "./slack.js";
export type { GuideState } from "./routers/review.js";
export type { BoardCard, Guide, RankedFile, ReviewColumn } from "./review/types.js";

// Shared helpers.
export { createTestContext } from "./context.js";
export type { Context, User } from "./context.js";
export { protectedProcedure, publicProcedure, router } from "./trpc.js";
