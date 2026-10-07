import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";
import { timestamps, timestamptz } from "./_helpers.js";
import { user } from "./auth.js";
import { workspace } from "./workspace.js";

/** plan.md §8 — Postgres mirror of GitHub data, kept fresh by webhooks. */

export const githubInstallation = pgTable("github_installation", {
  id: bigint("id", { mode: "number" }).primaryKey(), // GitHub installation id
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type", { enum: ["Organization", "User"] }).notNull(),
  suspendedAt: timestamptz("suspended_at"),
  ...timestamps,
});

export const repository = pgTable("repository", {
  id: bigint("id", { mode: "number" }).primaryKey(), // GitHub repo id
  installationId: bigint("installation_id", { mode: "number" })
    .notNull()
    .references(() => githubInstallation.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull().unique(), // "owner/name"
  defaultBranch: text("default_branch").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  /** Reviewers to request automatically on new PRs with none; 0 = off (plan M4). */
  autoAssign: integer("auto_assign").notNull().default(0),
  /** Team questions shown above the AI checklist on every PR (plan M6). */
  checklistTemplate: text("checklist_template").array().notNull().default([]),
  ...timestamps,
});

export const pullRequest = pgTable(
  "pull_request",
  {
    repoId: bigint("repo_id", { mode: "number" })
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    authorLogin: text("author_login").notNull(),
    state: text("state", { enum: ["open", "closed", "merged"] }).notNull(),
    draft: boolean("draft").notNull().default(false),
    headRef: text("head_ref").notNull(),
    headSha: text("head_sha").notNull(),
    baseRef: text("base_ref").notNull(),
    additions: integer("additions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    changedFiles: integer("changed_files").notNull().default(0),
    requestedReviewers: text("requested_reviewers").array().notNull().default([]),
    reviewColumn: text("review_column", {
      enum: ["needs_reviewer", "waiting", "changes_requested", "approved"],
    }).notNull(),
    stuck: boolean("stuck").notNull().default(false),
    labels: text("labels").array().notNull().default([]),
    /** GitHub's merge readiness: clean, blocked, dirty (conflicts), unstable, behind, … */
    mergeableState: text("mergeable_state"),
    /** Team flag kept in this app only (not on GitHub). */
    priority: boolean("priority").notNull().default(false),
    /** "I'm on it": someone took the review before GitHub has a requested reviewer. */
    claimedBy: text("claimed_by").references(() => user.id, { onDelete: "set null" }),
    /** Set once auto-assign has run, so it never re-requests after people are removed. */
    autoAssignedAt: timestamptz("auto_assigned_at"),
    lastActivityAt: timestamptz("last_activity_at").notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.repoId, t.number] }),
    index("pull_request_column_idx").on(t.repoId, t.reviewColumn),
    index("pull_request_stuck_idx").on(t.repoId, t.stuck),
  ],
);

export const prReview = pgTable(
  "pr_review",
  {
    id: bigint("id", { mode: "number" }).primaryKey(), // GitHub review id
    repoId: bigint("repo_id", { mode: "number" }).notNull(),
    prNumber: integer("pr_number").notNull(),
    reviewerLogin: text("reviewer_login").notNull(),
    state: text("state").notNull(),
    submittedAt: timestamptz("submitted_at").notNull(),
  },
  (t) => [index("pr_review_pr_idx").on(t.repoId, t.prNumber)],
);

export const prFile = pgTable(
  "pr_file",
  {
    repoId: bigint("repo_id", { mode: "number" }).notNull(),
    prNumber: integer("pr_number").notNull(),
    headSha: text("head_sha").notNull(),
    path: text("path").notNull(),
    blobSha: text("blob_sha").notNull(),
    status: text("status").notNull(),
    additions: integer("additions").notNull(),
    deletions: integer("deletions").notNull(),
    patch: text("patch"),
    tier: text("tier", { enum: ["core", "config", "test", "noise"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.repoId, t.prNumber, t.headSha, t.path] })],
);

export const prCheck = pgTable(
  "pr_check",
  {
    repoId: bigint("repo_id", { mode: "number" }).notNull(),
    headSha: text("head_sha").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    conclusion: text("conclusion"),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.repoId, t.headSha, t.name] })],
);

export const githubIdentity = pgTable("github_identity", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  githubLogin: text("github_login").notNull().unique(),
  githubUserId: bigint("github_user_id", { mode: "number" }).notNull().unique(),
  // GitHub App user-to-server token, so reviews and merges are attributed to
  // the person, not the App. AES-256-GCM, see packages/api/src/crypto.ts.
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  accessTokenExpiresAt: timestamptz("access_token_expires_at"),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
  ...timestamps,
});

/**
 * Repos each person can see on GitHub (via their user token), refreshed on
 * link and every 6 hours. Code is only shown for repos listed here.
 */
export const githubRepoAccess = pgTable(
  "github_repo_access",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repoId: bigint("repo_id", { mode: "number" }).notNull(),
    syncedAt: timestamptz("synced_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.repoId] })],
);
