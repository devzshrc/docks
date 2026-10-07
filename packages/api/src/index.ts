// Auth instance — used by apps/server (handler + session lookup).
// apps/web talks to it over HTTP via createAuthClient, never imports this.
export { auth } from "./auth.js";
export type { AuthUser, Session } from "./auth.js";

// Runtime entry — used by apps/server.
export { appRouter } from "./routers/_app.js";

// Type-only entry — used by apps/web via `import type { AppRouter }`.
export type { AppRouter } from "./routers/_app.js";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter as _AppRouter } from "./routers/_app.js";
/** Result types of every procedure, for clients that only import types. */
export type RouterOutputs = inferRouterOutputs<_AppRouter>;

// Review domain — used by apps/server (webhooks, setup callback, job worker).
export { claimNextJob, completeJob, enqueue, failJob, PermanentJobError } from "./jobs.js";
export type { Job, JobType } from "./jobs.js";
export { handleGithubEvent, verifyGithubSignature } from "./review/webhooks.js";
export { linkInstallation, purgeOldPatches, runAutoAssign, runRules, syncPr, syncRepo } from "./review/sync.js";
export { completeAuthorization, scheduleUserRepoSync, syncUserRepos } from "./review/github-user.js";
export { syncIssue, syncRepoIssues } from "./review/issues-sync.js";
export { generateGuideFor } from "./review/guide.js";
export { handleBillingWebhook } from "./billing.js";
export { scheduleWeeklyReports, sendWeeklyReport } from "./reports.js";
export type { Account } from "./routers/admin.js";
export { connectSlack, scheduleDigests, sendDigest } from "./slack.js";
export type { GuideState } from "./routers/review.js";
export type { BoardCard, Guide, RankedFile, ReviewColumn } from "./review/types.js";

// Shared helpers.
export { createTestContext } from "./context.js";
export type { Context, User } from "./context.js";
export { protectedProcedure, publicProcedure, router } from "./trpc.js";

// Types the web app needs without importing @docks/db directly.
export type { RoutingRule } from "@docks/db";
export type { BlameRange, GhIssue } from "./review/github.js";
export type { LinearIssue } from "./linear.js";
