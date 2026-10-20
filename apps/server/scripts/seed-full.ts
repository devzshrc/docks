/**
 * Dev-only: everything else on top of seed:demo, so every screen has data for
 * demo@docks.localhost. Run seed:demo first (or use `seed:full`, which runs both).
 *
 *   pnpm --filter @docks/server seed:full
 *
 * Adds: Team plan (premium grant), more open PRs (draft, stuck, claimed,
 * priority, labelled), a second repo, issues, teams and member profiles,
 * knowledge docs, deadline policy and cycles, a release, inbox items, saved
 * views, saved Ask answers, guide feedback, repo rules and audit history.
 * Re-running resets these rows. Refuses to run when NODE_ENV=production.
 */
import { auth } from "@docks/api";
import { closeDb, db, schema } from "@docks/db";
import { and, eq, inArray, like } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();
if (process.env.NODE_ENV === "production") throw new Error("seed:full is for local development only");

const WORKSPACE_ID = "demo-workspace";
const INSTALLATION_ID = 900_000_001;
const WEB = { id: 900_000_001, fullName: "demo/web" };
const API = { id: 900_000_002, fullName: "demo/api" };
const h = (hours: number) => new Date(Date.now() - hours * 3_600_000);
const sha = (s: string) => s.padEnd(40, "0").slice(0, 40);

async function userId(email: string) {
  const [u] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email));
  if (!u) throw new Error(`${email} not found: run seed:demo first`);
  return u.id;
}

async function ensureUser(email: string, name: string, login: string, fakeGithubId: number) {
  const [existing] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email));
  const id = existing?.id ?? (await auth.api.signUpEmail({ body: { email, password: "member-password-123", name } })).user.id;
  await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, id));
  await db
    .insert(schema.workspaceMember)
    .values({ workspaceId: WORKSPACE_ID, userId: id, role: "member" })
    .onConflictDoNothing();
  await db
    .insert(schema.githubIdentity)
    .values({ userId: id, githubLogin: login, githubUserId: fakeGithubId, accessTokenEncrypted: "seed:no-token" })
    .onConflictDoNothing();
  return id;
}

type File = { path: string; patch: string; additions: number; deletions: number; status?: string; tier?: "core" | "config" | "test" | "noise" };

async function insertPr(
  repo: { id: number },
  pr: {
    number: number;
    title: string;
    body?: string;
    author: string;
    column: "needs_reviewer" | "waiting" | "changes_requested" | "approved";
    reviewers?: string[];
    idleHours: number;
    draft?: boolean;
    labels?: string[];
    priority?: boolean;
    claimedBy?: string;
    files: File[];
    checks?: { name: string; status: string; conclusion: string | null }[];
  },
) {
  const headSha = sha(`full${repo.id % 10}${pr.number}`);
  await db.insert(schema.pullRequest).values({
    repoId: repo.id,
    number: pr.number,
    title: pr.title,
    body: pr.body ?? null,
    authorLogin: pr.author,
    state: "open",
    draft: pr.draft ?? false,
    headRef: `feature/${pr.number}`,
    headSha,
    baseRef: "main",
    additions: pr.files.reduce((n, f) => n + f.additions, 0),
    deletions: pr.files.reduce((n, f) => n + f.deletions, 0),
    changedFiles: pr.files.length,
    requestedReviewers: pr.reviewers ?? [],
    reviewColumn: pr.column,
    labels: pr.labels ?? [],
    priority: pr.priority ?? false,
    claimedBy: pr.claimedBy ?? null,
    lastActivityAt: h(pr.idleHours),
    ghCreatedAt: h(pr.idleHours + 6),
  });
  await db.insert(schema.prFile).values(
    pr.files.map((f, i) => ({
      repoId: repo.id,
      prNumber: pr.number,
      headSha,
      path: f.path,
      blobSha: sha(`fb${pr.number}${i}`),
      status: f.status ?? "modified",
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
      tier: f.tier ?? "core",
    })),
  );
  if (pr.checks?.length)
    await db.insert(schema.prCheck).values(pr.checks.map((c) => ({ repoId: repo.id, headSha, ...c, updatedAt: h(pr.idleHours) })));
  return headSha;
}

const patch = (lines: string[]) => `@@ -1,${lines.length} +1,${lines.length + 1} @@\n${lines.join("\n")}`;

async function main() {
  const owner = await userId("demo@docks.localhost");
  const admin = await userId("admin@docks.localhost");
  const viewer = await userId("viewer@docks.localhost");
  const dana = await ensureUser("dana@docks.localhost", "Dana Kim", "dana", -900_201);
  const raj = await ensureUser("raj@docks.localhost", "Raj Patel", "raj", -900_202);
  const mei = await ensureUser("mei@docks.localhost", "Mei Chen", "mei", -900_203);
  const people = [owner, admin, viewer, dana, raj, mei];

  // Team plan, so Deadlines, Releases and other paid features are on.
  await db.delete(schema.premiumGrant).where(eq(schema.premiumGrant.workspaceId, WORKSPACE_ID));
  await db.insert(schema.premiumGrant).values({ workspaceId: WORKSPACE_ID, createdBy: owner, reason: "Local demo seed" });
  await db.update(schema.workspace).set({ name: "Demo Co", stuckHours: 24 }).where(eq(schema.workspace.id, WORKSPACE_ID));

  // Second repository.
  await db
    .insert(schema.repository)
    .values({ id: API.id, installationId: INSTALLATION_ID, fullName: API.fullName, defaultBranch: "main", checklistTemplate: ["Is this change behind a feature flag if it touches billing?"] })
    .onConflictDoNothing();
  for (const id of people)
    for (const repoId of [WEB.id, API.id]) await db.insert(schema.githubRepoAccess).values({ userId: id, repoId }).onConflictDoNothing();

  // Reset rows this script owns.
  const seededPrs = [431, 432, 433, 434, 435, 436, 437];
  await db.delete(schema.pullRequest).where(and(eq(schema.pullRequest.repoId, WEB.id), inArray(schema.pullRequest.number, seededPrs)));
  await db.delete(schema.prFile).where(and(eq(schema.prFile.repoId, WEB.id), inArray(schema.prFile.prNumber, seededPrs)));
  for (const t of [schema.pullRequest, schema.prFile, schema.prCheck, schema.prReview] as const)
    await db.delete(t).where(eq(t.repoId, API.id));
  await db.delete(schema.issue).where(inArray(schema.issue.repoId, [WEB.id, API.id]));
  await db.delete(schema.team).where(eq(schema.team.workspaceId, WORKSPACE_ID));
  await db.delete(schema.repositoryKnowledge).where(inArray(schema.repositoryKnowledge.repoId, [WEB.id, API.id]));
  await db.delete(schema.reviewPolicy).where(inArray(schema.reviewPolicy.repoId, [WEB.id, API.id]));
  await db.delete(schema.reviewCycle).where(inArray(schema.reviewCycle.repoId, [WEB.id, API.id]));
  await db.delete(schema.release).where(eq(schema.release.workspaceId, WORKSPACE_ID));
  await db.delete(schema.reviewEvent).where(inArray(schema.reviewEvent.repoId, [WEB.id, API.id]));
  await db.delete(schema.savedView).where(eq(schema.savedView.workspaceId, WORKSPACE_ID));
  await db.delete(schema.reviewQuestion).where(inArray(schema.reviewQuestion.repoId, [WEB.id, API.id]));
  await db.delete(schema.guideFeedback).where(like(schema.guideFeedback.repo, "demo/%"));
  await db.delete(schema.repositoryRules).where(inArray(schema.repositoryRules.repoId, [WEB.id, API.id]));
  await db.delete(schema.auditLog).where(eq(schema.auditLog.workspaceId, WORKSPACE_ID));

  // More open PRs on demo/web: stuck, claimed, priority, labelled, draft, big.
  await insertPr(WEB, {
    number: 431, title: "Fix race when two tabs refresh the session", author: "mei", column: "waiting",
    reviewers: ["demo-reviewer"], idleHours: 52, priority: true, labels: ["bug", "auth"],
    body: "Two tabs refreshing at once could both rotate the token. This takes a lock.",
    files: [{ path: "src/auth/session.ts", additions: 12, deletions: 3, patch: patch([" export async function refresh() {", "-  const token = await rotate();", "+  const token = await withLock(\"refresh\", rotate);", "   return token;", " }"]) }],
    checks: [{ name: "test", status: "completed", conclusion: "success" }],
  });
  await insertPr(WEB, {
    number: 432, title: "Billing: prorate seat changes", author: "dana", column: "waiting",
    reviewers: ["demo-admin"], idleHours: 3, claimedBy: owner, labels: ["billing"],
    files: [
      { path: "src/billing/seats.ts", additions: 40, deletions: 8, patch: patch([" export function seatDelta(prev: number, next: number) {", "-  return next - prev;", "+  return Math.max(0, next - prev);", " }"]) },
      { path: "src/billing/seats.test.ts", additions: 22, deletions: 0, status: "added", tier: "test", patch: "@@ -0,0 +1,2 @@\n+import { seatDelta } from \"./seats\";\n+test(\"never negative\", () => expect(seatDelta(5, 3)).toBe(0));" },
    ],
    checks: [{ name: "test", status: "completed", conclusion: "failure" }],
  });
  await insertPr(WEB, {
    number: 433, title: "WIP: dark mode for emails", author: "raj", column: "needs_reviewer", idleHours: 10, draft: true,
    files: [{ path: "src/email/theme.ts", additions: 5, deletions: 0, status: "added", patch: "@@ -0,0 +1,1 @@\n+export const dark = { bg: \"#111\" };" }],
  });
  await insertPr(WEB, {
    number: 434, title: "Migrate users table to soft deletes", author: "dana", column: "changes_requested", idleHours: 20,
    labels: ["database"],
    files: [
      { path: "drizzle/0042_soft_delete.sql", additions: 6, deletions: 0, status: "added", patch: "@@ -0,0 +1,2 @@\n+ALTER TABLE users ADD COLUMN deleted_at timestamptz;\n+CREATE INDEX users_deleted_idx ON users (deleted_at);" },
      { path: "src/users/repo.ts", additions: 9, deletions: 4, patch: patch([" export function activeUsers() {", "-  return db.select().from(users);", "+  return db.select().from(users).where(isNull(users.deletedAt));", " }"]) },
    ],
  });
  await insertPr(WEB, {
    number: 435, title: "Update copy on pricing page", author: "mei", column: "approved", idleHours: 1, labels: ["copy"],
    files: [{ path: "src/pages/pricing.tsx", additions: 3, deletions: 3, patch: patch(["-<h1>Plans</h1>", "+<h1>Simple pricing</h1>", " <Plans />"]) }],
    checks: [{ name: "build", status: "completed", conclusion: "success" }],
  });
  await insertPr(WEB, {
    number: 436, title: "Large refactor: split dashboard widgets", author: "raj", column: "waiting", reviewers: ["demo-reviewer", "mei"], idleHours: 28,
    files: Array.from({ length: 14 }, (_, i) => ({
      path: `src/dashboard/widgets/widget-${i + 1}.tsx`, additions: 30 + i, deletions: 10, status: i % 3 ? "modified" : "added",
      patch: patch([` export function Widget${i + 1}() {`, "-  return <div className=\"w\" />;", `+  return <Card title=\"Widget ${i + 1}\" />;`, " }"]),
    })),
    checks: [{ name: "test", status: "in_progress", conclusion: null }],
  });
  await insertPr(WEB, {
    number: 437, title: "Add rate limit headers to API responses", author: "dana", column: "waiting", reviewers: ["raj"], idleHours: 4,
    files: [{ path: "src/http/headers.ts", additions: 8, deletions: 1, patch: patch([" export function headers(res) {", "+  res.set(\"RateLimit-Remaining\", String(remaining));", "   return res;", " }"]) }],
  });

  // demo/api: a few PRs plus merged history for Insights by repo.
  await insertPr(API, {
    number: 88, title: "Webhook retries with exponential backoff", author: "raj", column: "waiting", reviewers: ["demo-reviewer"], idleHours: 30,
    files: [{ path: "src/webhooks/retry.ts", additions: 25, deletions: 2, patch: patch([" export function delay(attempt: number) {", "-  return 1000;", "+  return Math.min(60_000, 1000 * 2 ** attempt);", " }"]) }],
    checks: [{ name: "test", status: "completed", conclusion: "success" }],
  });
  await insertPr(API, {
    number: 87, title: "Add /v2/invoices endpoint", author: "mei", column: "needs_reviewer", idleHours: 8,
    files: [{ path: "src/routes/invoices.ts", additions: 60, deletions: 0, status: "added", patch: "@@ -0,0 +1,2 @@\n+router.get(\"/v2/invoices\", list);\n+router.get(\"/v2/invoices/:id\", get);" }],
  });
  for (let i = 0; i < 12; i++) {
    const created = h(24 * 50 - i * 90);
    const firstReview = new Date(created.getTime() + (3 + ((i * 11) % 40)) * 3_600_000);
    const merged = new Date(firstReview.getTime() + 10 * 3_600_000);
    await db.insert(schema.pullRequest).values({
      repoId: API.id, number: 40 + i, title: `API change ${40 + i}`, authorLogin: ["raj", "mei", "dana"][i % 3]!, state: "merged",
      headRef: `f/${i}`, headSha: sha(`apih${i}`), baseRef: "main", additions: 50 + i * 20, deletions: 10, changedFiles: 2,
      reviewColumn: "approved", lastActivityAt: merged, ghCreatedAt: created, firstReviewAt: firstReview, mergedAt: merged,
    });
    await db.insert(schema.prReview).values({
      id: 900_002_000 + i, repoId: API.id, prNumber: 40 + i, reviewerLogin: ["demo-reviewer", "dana", "raj"][i % 3]!, state: "APPROVED", submittedAt: firstReview,
    });
  }

  // Issues on both repos.
  const issue = (repo: number, number: number, title: string, o: Partial<typeof schema.issue.$inferInsert> = {}) => ({
    repoId: repo, number, title, body: o.body ?? `Details for ${title.toLowerCase()}.`, state: "open" as const, authorLogin: "dana",
    ghCreatedAt: h(24 * ((number % 9) + 1)), ghUpdatedAt: h(number % 20), ...o,
  });
  await db.insert(schema.issue).values([
    issue(WEB.id, 501, "Login page flashes unstyled content", { labels: [{ name: "bug", color: "d73a4a" }], assignees: ["demo-reviewer"], milestone: "October" }),
    issue(WEB.id, 502, "Add keyboard shortcut for approving", { labels: [{ name: "enhancement", color: "a2eeef" }], authorLogin: "mei" }),
    issue(WEB.id, 503, "Dashboard is slow with 300+ PRs", { labels: [{ name: "performance", color: "fbca04" }], assignees: ["raj"], commentsCount: 4, milestone: "October" }),
    issue(WEB.id, 504, "Typo in onboarding step 2", { labels: [{ name: "good first issue", color: "7057ff" }] }),
    issue(WEB.id, 505, "Session expires during long reviews", { labels: [{ name: "bug", color: "d73a4a" }, { name: "auth", color: "0e8a16" }], assignees: ["mei"] }),
    issue(WEB.id, 498, "Old export button still visible", { state: "closed", closedAt: h(30), stateReason: "completed" }),
    issue(API.id, 120, "Invoices endpoint returns 500 for empty accounts", { labels: [{ name: "bug", color: "d73a4a" }], assignees: ["raj"], milestone: "Q4" }),
    issue(API.id, 121, "Document webhook signature format", { labels: [{ name: "docs", color: "0075ca" }] }),
    issue(API.id, 119, "Rotate signing keys", { state: "closed", closedAt: h(80), stateReason: "completed" }),
  ]);
  await db.update(schema.repository).set({ issuesSyncedAt: new Date() }).where(inArray(schema.repository.id, [WEB.id, API.id]));

  // Teams and member profiles.
  await db.insert(schema.team).values([
    { id: "team-platform", workspaceId: WORKSPACE_ID, name: "Platform" },
    { id: "team-growth", workspaceId: WORKSPACE_ID, name: "Growth" },
  ]);
  await db.insert(schema.teamMember).values([
    { teamId: "team-platform", userId: owner }, { teamId: "team-platform", userId: raj }, { teamId: "team-platform", userId: dana },
    { teamId: "team-growth", userId: mei }, { teamId: "team-growth", userId: admin },
  ]);
  const profile = (id: string, set: Partial<typeof schema.workspaceMember.$inferInsert>) =>
    db.update(schema.workspaceMember).set(set).where(and(eq(schema.workspaceMember.workspaceId, WORKSPACE_ID), eq(schema.workspaceMember.userId, id)));
  await profile(owner, { expertise: ["auth", "billing"], maxOpenReviews: 4 });
  await profile(raj, { expertise: ["api", "webhooks"], maxOpenReviews: 3 });
  await profile(mei, { expertise: ["frontend"], awayUntil: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10) });
  await profile(dana, { expertise: ["database", "billing"] });

  // Repository knowledge (with revision history).
  const docs = [
    { repoId: WEB.id, title: "Auth conventions", category: "conventions", body: "# Auth\n\n- Never log tokens.\n- Session refresh goes through `withLock`.\n- Rate-limit every credential endpoint." },
    { repoId: WEB.id, title: "Database migrations", category: "process", body: "# Migrations\n\nMigrations must be additive. Backfill in a separate job, never in the migration." },
    { repoId: API.id, title: "Webhook delivery", category: "architecture", body: "# Webhooks\n\nRetries back off exponentially up to 60s; deliveries are idempotent by event id." },
  ];
  for (const d of docs) {
    const [row] = await db.insert(schema.repositoryKnowledge).values({ ...d, version: 2 }).returning();
    await db.insert(schema.repositoryKnowledgeRevision).values([
      { documentId: row!.id, version: 1, title: d.title, category: d.category, body: d.body.split("\n")[0]!, archived: false, authorId: admin },
      { documentId: row!.id, version: 2, title: d.title, category: d.category, body: d.body, archived: false, authorId: owner },
    ]);
  }

  // Deadline policy and live cycles (one due soon, one overdue).
  const schedule = { timezone: "Asia/Kolkata", days: [1, 2, 3, 4, 5], startHour: 10, endHour: 19 };
  const rules = { hours: 8, reminderHours: 2, schedule, leadUserId: admin };
  await db.insert(schema.reviewPolicy).values([
    { repoId: WEB.id, enabled: true, rules },
    { repoId: API.id, enabled: true, rules: { ...rules, hours: 16 } },
  ]);
  await db.insert(schema.reviewCycle).values([
    { repoId: WEB.id, prNumber: 437, kind: "first", reviewer: "raj", headSha: sha("full1437"), sourceKey: "seed:437:raj", rules, startedAt: h(4), dueAt: new Date(Date.now() + 2 * 3_600_000), remindAt: h(-0.5) },
    { repoId: WEB.id, prNumber: 431, kind: "first", reviewer: "demo-reviewer", headSha: sha("full1431"), sourceKey: "seed:431:demo", rules, startedAt: h(52), dueAt: h(20), remindAt: h(22), backupLogin: "dana" },
    { repoId: API.id, prNumber: 88, kind: "first", reviewer: "demo-reviewer", headSha: sha("full288"), sourceKey: "seed:88:demo", rules: { ...rules, hours: 16 }, startedAt: h(30), dueAt: h(6), remindAt: h(8) },
  ]);

  // A release with PRs from both repos.
  const [rel] = await db
    .insert(schema.release)
    .values({ workspaceId: WORKSPACE_ID, name: "October product update", targetDate: new Date(Date.now() + 5 * 86_400_000) })
    .returning();
  await db.insert(schema.releasePr).values([
    { releaseId: rel!.id, repoId: WEB.id, prNumber: 435 },
    { releaseId: rel!.id, repoId: WEB.id, prNumber: 432 },
    { releaseId: rel!.id, repoId: API.id, prNumber: 88 },
  ]);
  await db.insert(schema.release).values({ workspaceId: WORKSPACE_ID, name: "September hotfixes", targetDate: h(24 * 20), status: "completed" });

  // Inbox for the owner.
  const events: { repoId: number; pr: number; kind: (typeof schema.reviewEvent.$inferInsert)["kind"]; actor: string; title: string; ago: number; read?: boolean }[] = [
    { repoId: WEB.id, pr: 431, kind: "review_requested", actor: "mei", title: "Fix race when two tabs refresh the session", ago: 52 },
    { repoId: WEB.id, pr: 436, kind: "review_requested", actor: "raj", title: "Large refactor: split dashboard widgets", ago: 28 },
    { repoId: WEB.id, pr: 412, kind: "new_commit", actor: "raj", title: "Onboarding wizard v2", ago: 5 },
    { repoId: WEB.id, pr: 418, kind: "thread_reply", actor: "dana", title: "Rate-limit login attempts", ago: 2 },
    { repoId: WEB.id, pr: 432, kind: "check_failed", actor: "github-actions", title: "Billing: prorate seat changes", ago: 3 },
    { repoId: WEB.id, pr: 431, kind: "review_overdue", actor: "docks", title: "Fix race when two tabs refresh the session", ago: 20 },
    { repoId: API.id, pr: 88, kind: "review_reminder", actor: "docks", title: "Webhook retries with exponential backoff", ago: 8, read: true },
    { repoId: WEB.id, pr: 410, kind: "review_submitted", actor: "raj", title: "Search index for docs", ago: 2, read: true },
  ];
  for (const [i, e] of events.entries()) {
    const [ev] = await db
      .insert(schema.reviewEvent)
      .values({
        repoId: e.repoId, prNumber: e.pr, sourceKey: `seed:${i}`, kind: e.kind, occurredAt: h(e.ago), processedAt: h(e.ago),
        context: { title: e.title, actor: e.actor, headSha: null, url: null, requestedLogin: e.kind === "review_requested" ? "demo-reviewer" : null, replyTo: null },
      })
      .returning();
    await db.insert(schema.inboxItem).values({ eventId: ev!.id, userId: owner, readAt: e.read ? h(1) : null });
  }

  // Saved board views.
  await db.insert(schema.savedView).values([
    { id: "seed-view-1", userId: owner, workspaceId: WORKSPACE_ID, name: "Stuck on me", query: "waitingOnMe=1&sort=oldest" },
    { id: "seed-view-2", userId: owner, workspaceId: WORKSPACE_ID, name: "Billing PRs", query: "label=billing" },
  ]);

  // Saved Ask answers on #418 and a vote on its guide.
  const s418 = sha("demo418");
  await db.insert(schema.reviewQuestion).values([
    { repoId: WEB.id, prNumber: 418, userId: owner, headSha: s418, question: "What happens when the limit is hit?", answer: "login() throws \"Too many attempts. Try again in a minute.\" before checking the password (src/auth/login.ts:12).", path: null, citations: [{ path: "src/auth/login.ts", line: 12, side: "RIGHT" }], knowledge: [] },
    { repoId: WEB.id, prNumber: 418, userId: owner, headSha: sha("old418"), question: "Is the limiter shared across instances?", answer: "No: buckets live in a process-local Map (src/rate-limit.ts:1).", path: "src/rate-limit.ts", citations: [{ path: "src/rate-limit.ts", line: 1, side: "RIGHT" }], knowledge: [] },
  ]);
  await db.insert(schema.guideFeedback).values([
    { userId: owner, repo: WEB.fullName, prNumber: 418, headSha: s418, item: "summary", vote: 1 },
    { userId: owner, repo: WEB.fullName, prNumber: 418, headSha: s418, item: "check:1", vote: 1 },
    { userId: admin, repo: WEB.fullName, prNumber: 418, headSha: s418, item: "step:2", vote: -1 },
  ]);

  // Repo rules (as if read from .github/docks.yml), so settings and ranking show them.
  await db.insert(schema.repositoryRules).values({
    repoId: WEB.id,
    fileSha: "seed",
    rules: { tiers: { noise: ["src/dashboard/widgets/generated/"], config: ["drizzle/"] }, checklist: [{ paths: ["drizzle/"], question: "Does this migration handle existing rows and roll back cleanly?" }] },
    error: null,
    checkedAt: new Date(Date.now() + 365 * 86_400_000), // never stale locally, so sync won't try GitHub
  });

  // Audit history.
  await db.insert(schema.auditLog).values([
    { workspaceId: WORKSPACE_ID, actorId: owner, action: "workspace.rename", target: "Demo Co", at: h(200) },
    { workspaceId: WORKSPACE_ID, actorId: owner, action: "member.role", target: admin, meta: { role: "admin" }, at: h(150) },
    { workspaceId: WORKSPACE_ID, actorId: admin, action: "team.create", target: "Platform", at: h(120) },
    { workspaceId: WORKSPACE_ID, actorId: owner, action: "repo.settings", target: WEB.fullName, meta: { aiEnabled: true }, at: h(90) },
    { workspaceId: WORKSPACE_ID, actorId: owner, action: "review.approve", target: "demo/web#410", at: h(2) },
  ]);

  // Leftover jobs for the fake repos would fail against real GitHub.
  const jobs = await db.select({ id: schema.jobs.id, payload: schema.jobs.payload }).from(schema.jobs);
  const fake = jobs.filter((j) => [WEB.id, API.id].includes((j.payload as { repoId?: number }).repoId ?? 0)).map((j) => j.id);
  if (fake.length) await db.delete(schema.jobs).where(inArray(schema.jobs.id, fake));

  console.log("Seeded the full demo for demo@docks.localhost (Team plan, 2 repos, issues, teams, knowledge, deadlines, releases, inbox).");
  console.log("Extra members dana@, raj@, mei@docks.localhost use password member-password-123.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
