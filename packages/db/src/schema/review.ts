import { integer, jsonb, pgTable, primaryKey, smallint, text } from "drizzle-orm/pg-core";
import { timestamps } from "./_helpers.js";
import { user } from "./auth.js";

/** plan.md §6.3 — one AI guide per PR head commit. */
export const reviewGuide = pgTable(
  "review_guide",
  {
    repo: text("repo").notNull(), // "owner/name"
    prNumber: integer("pr_number").notNull(),
    headSha: text("head_sha").notNull(),
    model: text("model").notNull(), // model that actually served it (fallbacks may differ)
    guide: jsonb("guide").notNull(),
    // Cost tracking per workspace (plan.md §10).
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.repo, t.prNumber, t.headSha] })],
);

/**
 * Thumbs up/down on one part of a guide: "summary", "step:<i>" or "check:<i>".
 * Keyed by head SHA, so a vote belongs to the guide the person actually read.
 */
export const guideFeedback = pgTable(
  "guide_feedback",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repo: text("repo").notNull(),
    prNumber: integer("pr_number").notNull(),
    headSha: text("head_sha").notNull(),
    item: text("item").notNull(),
    vote: smallint("vote").notNull(), // 1 or -1
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.repo, t.prNumber, t.headSha, t.item] })],
);

/** plan.md §5.3 — per-user viewed state, keyed by file blob SHA. */
export const reviewProgress = pgTable(
  "review_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repo: text("repo").notNull(),
    prNumber: integer("pr_number").notNull(),
    path: text("path").notNull(),
    fileSha: text("file_sha").notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.repo, t.prNumber, t.path] })],
);

/** Head commit each person last submitted a review on, for "changes since my last review" (plan M6). */
export const reviewVisit = pgTable(
  "review_visit",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repo: text("repo").notNull(),
    prNumber: integer("pr_number").notNull(),
    reviewedSha: text("reviewed_sha").notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.repo, t.prNumber] })],
);
