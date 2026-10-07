/**
 * Dev-only demo data for the review board and guided review, without a
 * GitHub App. Creates (or reuses) a demo user and a fake "demo/web" repo
 * with PRs in every column.
 *
 *   pnpm --filter @docks/server seed:demo
 *   pnpm --filter @docks/server seed:demo --email you@example.com   # also add your account as an owner
 *
 * Sign in at http://localhost:3000/login with the DEMO_* values below.
 * INVITEE_* is a second user with no workspace, for trying invite links.
 * Local development only; refuses to run when NODE_ENV=production.
 */
import { auth } from "@docks/api";
import { closeDb, db, schema } from "@docks/db";
import { and, eq, inArray } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

const DEMO_EMAIL = "demo@docks.localhost";
const DEMO_PASSWORD = "demo-password-123";
const DEMO_NAME = "Demo Reviewer";
// Second user with no workspace, for trying invite links.
const INVITEE_EMAIL = "invitee@docks.localhost";
const INVITEE_PASSWORD = "invitee-password-123";
const INVITEE_NAME = "Demo Invitee";
// Extra members for trying roles (M2).
const ROLE_USERS = [
  { email: "admin@docks.localhost", password: "admin-password-123", name: "Demo Admin", role: "admin" as const, login: "demo-admin" },
  { email: "viewer@docks.localhost", password: "viewer-password-123", name: "Demo Viewer", role: "viewer" as const, login: "demo-viewer" },
];

const WORKSPACE_ID = "demo-workspace";
const INSTALLATION_ID = 900_000_001;
const REPO_ID = 900_000_001;
const REPO = "demo/web";

if (process.env.NODE_ENV === "production") {
  throw new Error("seed:demo is for local development only");
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

const PATCH_API = `@@ -1,12 +1,24 @@
 import { z } from "zod";
-import { db } from "./db";
+import { db, schema } from "./db";
+import { rateLimit } from "./rate-limit";

 export const loginInput = z.object({
   email: z.string().email(),
   password: z.string().min(8),
 });

-export async function login(input: unknown) {
+export async function login(input: unknown, ip: string) {
+  if (!(await rateLimit.allow(\`login:\${ip}\`, { max: 5, windowMs: 60_000 }))) {
+    throw new Error("Too many attempts. Try again in a minute.");
+  }
   const { email, password } = loginInput.parse(input);
-  const user = await db.findUser(email);
+  const [user] = await db
+    .select()
+    .from(schema.user)
+    .where(eq(schema.user.email, email))
+    .limit(1);
   return verify(user, password);
 }`;

const PATCH_LIMIT = `@@ -0,0 +1,18 @@
+const buckets = new Map<string, { count: number; resetAt: number }>();
+
+export const rateLimit = {
+  async allow(key: string, opts: { max: number; windowMs: number }) {
+    const now = Date.now();
+    const bucket = buckets.get(key);
+    if (!bucket || bucket.resetAt < now) {
+      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
+      return true;
+    }
+    bucket.count += 1;
+    return bucket.count <= opts.max;
+  },
+};`;

const PATCH_TEST = `@@ -0,0 +1,9 @@
+import { expect, test } from "vitest";
+import { rateLimit } from "../src/rate-limit";
+
+test("blocks the sixth attempt in a window", async () => {
+  for (let i = 0; i < 5; i++) {
+    expect(await rateLimit.allow("k", { max: 5, windowMs: 1000 })).toBe(true);
+  }
+  expect(await rateLimit.allow("k", { max: 5, windowMs: 1000 })).toBe(false);
+});`;

const PRS = [
  {
    number: 418,
    title: "Rate-limit login attempts",
    author: "dana",
    column: "waiting" as const,
    reviewers: ["demo-reviewer", "raj"],
    lastActivityAt: hoursAgo(30), // stuck
    files: [
      { path: "src/auth/login.ts", patch: PATCH_API, additions: 14, deletions: 2 },
      { path: "src/rate-limit.ts", patch: PATCH_LIMIT, additions: 14, deletions: 0, status: "added" },
      { path: "tests/rate-limit.test.ts", patch: PATCH_TEST, additions: 9, deletions: 0, status: "added", tier: "test" as const },
      { path: "package.json", patch: `@@ -12,6 +12,7 @@\n   "dependencies": {\n+    "vitest": "^3.0.0",\n     "zod": "^3.25.0"`, additions: 1, deletions: 0, tier: "config" as const },
      { path: "pnpm-lock.yaml", patch: "@@ -1,3 +1,4 @@\n+  vitest: 3.0.0", additions: 120, deletions: 4, tier: "noise" as const },
    ],
    checks: [
      { name: "lint", status: "completed", conclusion: "success" },
      { name: "test", status: "completed", conclusion: "success" },
    ],
  },
  {
    number: 415,
    title: "Bump Next.js to 15.5",
    author: "dependabot",
    column: "needs_reviewer" as const,
    reviewers: [],
    lastActivityAt: hoursAgo(50),
    files: [{ path: "package.json", patch: `@@ -20,1 +20,1 @@\n-    "next": "^15.4.0",\n+    "next": "^15.5.0",`, additions: 1, deletions: 1, tier: "config" as const }],
    checks: [{ name: "build", status: "completed", conclusion: "failure" }],
  },
  {
    number: 412,
    title: "Onboarding wizard v2",
    author: "raj",
    column: "changes_requested" as const,
    reviewers: [],
    lastActivityAt: hoursAgo(5),
    files: [{ path: "src/onboarding/wizard.tsx", patch: `@@ -1,3 +1,4 @@\n export function Wizard() {\n+  const [step, setStep] = useState(0);\n   return null;\n }`, additions: 1, deletions: 0 }],
    checks: [{ name: "test", status: "in_progress", conclusion: null }],
    reviews: [{ id: 900_000_101, login: "demo-reviewer", state: "CHANGES_REQUESTED" }],
  },
  {
    number: 410,
    title: "Search index for docs",
    author: "mei",
    column: "approved" as const,
    reviewers: [],
    lastActivityAt: hoursAgo(2),
    files: [{ path: "src/search/index.ts", patch: `@@ -0,0 +1,2 @@\n+export const index = new Map<string, string[]>();\n+export const search = (q: string) => index.get(q) ?? [];`, additions: 2, deletions: 0, status: "added" }],
    checks: [{ name: "test", status: "completed", conclusion: "success" }],
    reviews: [{ id: 900_000_102, login: "raj", state: "APPROVED" }],
  },
];

async function ensureUser(email: string, password: string, name: string): Promise<string> {
  const [existing] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);
  const id = existing?.id ?? (await auth.api.signUpEmail({ body: { email, password, name } })).user.id;
  // Seed accounts skip the confirmation email.
  await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, id));
  return id;
}

/**
 * Code is only shown for repos a person can see on GitHub (M2). Demo users have
 * no real GitHub account, so give them a placeholder identity and access to the
 * demo repo. Review actions still need a real GitHub connection.
 */
async function grantDemoRepoAccess(userId: string, login: string, fakeGithubId: number) {
  const [identity] = await db
    .select({ userId: schema.githubIdentity.userId })
    .from(schema.githubIdentity)
    .where(eq(schema.githubIdentity.userId, userId));
  if (!identity) {
    await db
      .insert(schema.githubIdentity)
      .values({ userId, githubLogin: login, githubUserId: fakeGithubId, accessTokenEncrypted: "seed:no-token" })
      .onConflictDoNothing();
  }
  await db.insert(schema.githubRepoAccess).values({ userId, repoId: REPO_ID }).onConflictDoNothing();
}

async function main() {
  const userId = await ensureUser(DEMO_EMAIL, DEMO_PASSWORD, DEMO_NAME);
  const inviteeId = await ensureUser(INVITEE_EMAIL, INVITEE_PASSWORD, INVITEE_NAME);
  // --email: add an existing account (sign up first) to the demo workspace.
  const emailArg = process.argv.indexOf("--email");
  const extraEmail = emailArg > -1 ? process.argv[emailArg + 1] : undefined;
  let extraUserId: string | undefined;
  if (extraEmail) {
    const [found] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, extraEmail.toLowerCase()))
      .limit(1);
    if (!found) throw new Error(`No account for ${extraEmail}. Sign up at http://localhost:3000/signup first.`);
    extraUserId = found.id;
  }

  // Reset: the invitee starts outside the workspace; old invites are dropped.
  await db
    .delete(schema.workspaceMember)
    .where(and(eq(schema.workspaceMember.workspaceId, WORKSPACE_ID), eq(schema.workspaceMember.userId, inviteeId)));
  await db.delete(schema.workspaceInvite).where(eq(schema.workspaceInvite.workspaceId, WORKSPACE_ID));

  await db
    .insert(schema.workspace)
    .values({ id: WORKSPACE_ID, name: "Demo", slug: "demo" })
    .onConflictDoNothing();
  await db
    .insert(schema.workspaceMember)
    .values({ workspaceId: WORKSPACE_ID, userId, role: "owner" })
    .onConflictDoNothing();
  if (extraUserId) {
    await db
      .insert(schema.workspaceMember)
      .values({ workspaceId: WORKSPACE_ID, userId: extraUserId, role: "owner" })
      .onConflictDoNothing();
  }
  await db
    .insert(schema.githubInstallation)
    .values({ id: INSTALLATION_ID, workspaceId: WORKSPACE_ID, accountLogin: "demo", accountType: "Organization" })
    .onConflictDoNothing();
  const roleUserIds: string[] = [];
  for (const u of ROLE_USERS) {
    const id = await ensureUser(u.email, u.password, u.name);
    roleUserIds.push(id);
    await db
      .insert(schema.workspaceMember)
      .values({ workspaceId: WORKSPACE_ID, userId: id, role: u.role })
      .onConflictDoUpdate({
        target: [schema.workspaceMember.workspaceId, schema.workspaceMember.userId],
        set: { role: u.role },
      });
  }
  await db
    .insert(schema.repository)
    .values({ id: REPO_ID, installationId: INSTALLATION_ID, fullName: REPO, defaultBranch: "main" })
    .onConflictDoNothing();
  await grantDemoRepoAccess(userId, "demo-reviewer", -900_001);
  for (const [i, u] of ROLE_USERS.entries()) await grantDemoRepoAccess(roleUserIds[i]!, u.login, -900_010 - i);
  if (extraUserId) await grantDemoRepoAccess(extraUserId, `demo-${extraUserId.slice(0, 8)}`, -900_100);

  // Start clean so re-running the seed resets the demo.
  await db.delete(schema.pullRequest).where(eq(schema.pullRequest.repoId, REPO_ID));
  await db.delete(schema.prFile).where(eq(schema.prFile.repoId, REPO_ID));
  await db.delete(schema.prCheck).where(eq(schema.prCheck.repoId, REPO_ID));
  await db.delete(schema.prReview).where(eq(schema.prReview.repoId, REPO_ID));
  await db.delete(schema.reviewProgress).where(eq(schema.reviewProgress.repo, REPO));
  await db.delete(schema.reviewGuide).where(eq(schema.reviewGuide.repo, REPO));

  for (const pr of PRS) {
    const headSha = `demo${pr.number}`.padEnd(40, "0");
    const additions = pr.files.reduce((n, f) => n + f.additions, 0);
    const deletions = pr.files.reduce((n, f) => n + f.deletions, 0);
    await db.insert(schema.pullRequest).values({
      repoId: REPO_ID,
      number: pr.number,
      title: pr.title,
      body: null,
      authorLogin: pr.author,
      state: "open",
      headRef: `feature/${pr.number}`,
      headSha,
      baseRef: "main",
      additions,
      deletions,
      changedFiles: pr.files.length,
      requestedReviewers: pr.reviewers,
      reviewColumn: pr.column,
      lastActivityAt: pr.lastActivityAt,
      ghCreatedAt: new Date(pr.lastActivityAt.getTime() - 2 * 3_600_000),
    });
    await db.insert(schema.prFile).values(
      pr.files.map((f, i) => ({
        repoId: REPO_ID,
        prNumber: pr.number,
        headSha,
        path: f.path,
        blobSha: `blob${pr.number}${i}`.padEnd(40, "0"),
        status: "status" in f && f.status ? f.status : "modified",
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
        tier: "tier" in f && f.tier ? f.tier : ("core" as const),
      })),
    );
    await db.insert(schema.prCheck).values(
      pr.checks.map((c) => ({ repoId: REPO_ID, headSha, ...c, updatedAt: pr.lastActivityAt })),
    );
    if ("reviews" in pr && pr.reviews) {
      await db.insert(schema.prReview).values(
        pr.reviews.map((r) => ({
          id: r.id,
          repoId: REPO_ID,
          prNumber: pr.number,
          reviewerLogin: r.login,
          state: r.state,
          submittedAt: hoursAgo(1),
        })),
      );
    }
  }

  // Merged history for Insights (plan M7): 24 PRs over 8 weeks, deterministic.
  const authors = ["dana", "raj", "mei", "dependabot"];
  const reviewers = ["demo-reviewer", "raj", "demo-admin", "mei"];
  for (let i = 0; i < 24; i++) {
    const number = 300 + i;
    const created = hoursAgo(24 * 56 - i * 55);
    const waitHours = 1 + ((i * 7) % 30); // 1h to 30h to first review
    const firstReview = new Date(created.getTime() + waitHours * 3_600_000);
    const merged = new Date(firstReview.getTime() + (4 + ((i * 5) % 40)) * 3_600_000);
    const author = authors[i % authors.length]!;
    const reviewer = reviewers.filter((r) => r !== author)[i % 3]!;
    const lines = [20, 80, 150, 420, 900][i % 5]!;
    await db.insert(schema.pullRequest).values({
      repoId: REPO_ID,
      number,
      title: `Historical change ${number}`,
      body: null,
      authorLogin: author,
      state: "merged",
      headRef: `feature/${number}`,
      headSha: `hist${number}`.padEnd(40, "0"),
      baseRef: "main",
      additions: Math.round(lines * 0.7),
      deletions: Math.round(lines * 0.3),
      changedFiles: 3,
      requestedReviewers: [],
      reviewColumn: "approved",
      lastActivityAt: merged,
      ghCreatedAt: created,
      firstReviewAt: firstReview,
      mergedAt: merged,
    });
    await db.insert(schema.prReview).values({
      id: 900_001_000 + i,
      repoId: REPO_ID,
      prNumber: number,
      reviewerLogin: reviewer,
      state: "APPROVED",
      submittedAt: firstReview,
    });
  }

  // A ready-made guide for #418 so the guide UI works without an API key.
  // The other PRs go through the real generate_guide job.
  await db.insert(schema.reviewGuide).values({
    repo: REPO,
    prNumber: 418,
    headSha: "demo418".padEnd(40, "0"),
    model: "demo-seed",
    inputTokens: 0,
    outputTokens: 0,
    guide: {
      source: "ai",
      summary:
        "Adds per-IP rate limiting to login (5 attempts per minute) and switches the user lookup to the Drizzle query builder. Includes a unit test for the limiter and adds vitest.",
      steps: [
        {
          title: "Rate limiter",
          why: "In-memory buckets keyed by string; check the window reset and counting logic.",
          files: ["src/rate-limit.ts"],
        },
        {
          title: "Login flow",
          why: "New ip parameter and early rejection; check every caller passes a real client IP.",
          files: ["src/auth/login.ts"],
        },
        {
          title: "Tests and tooling",
          why: "One test for the limiter; vitest added as a dependency.",
          files: ["tests/rate-limit.test.ts", "package.json"],
        },
      ],
      checklist: [
        {
          question: "Does every caller of login() pass the client IP, including behind the proxy (X-Forwarded-For)?",
          files: ["src/auth/login.ts"],
        },
        {
          question: "Is an in-memory limiter acceptable with more than one server instance, or do we need a shared store?",
          files: ["src/rate-limit.ts"],
        },
        {
          question: "Do buckets for old keys ever get removed, or can the map grow without bound?",
          files: ["src/rate-limit.ts"],
        },
        {
          question: "Is there a test for the window resetting after it expires?",
          files: ["tests/rate-limit.test.ts"],
        },
      ],
    },
  });

  // Leftover jobs for the fake repo would fail against real GitHub.
  const jobs = await db.select({ id: schema.jobs.id, payload: schema.jobs.payload }).from(schema.jobs);
  const demoJobs = jobs.filter((j) => (j.payload as { repoId?: number }).repoId === REPO_ID).map((j) => j.id);
  if (demoJobs.length) await db.delete(schema.jobs).where(inArray(schema.jobs.id, demoJobs));

  if (extraEmail) console.log(`Added ${extraEmail} to the demo workspace as an owner.`);
  console.log(
    `Seeded ${PRS.length} PRs in ${REPO}. Sign in as ${DEMO_EMAIL} (owner), ${ROLE_USERS.map((u) => `${u.email} (${u.role})`).join(", ")}; ${INVITEE_EMAIL} has no workspace. Passwords are in this script.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
