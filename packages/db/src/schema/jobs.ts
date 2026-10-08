import { index, integer, jsonb, pgTable, serial, text } from "drizzle-orm/pg-core";
import { timestamps, timestamptz } from "./_helpers.js";

/** plan.md §7 — row-level job queue polled by apps/server worker. */
export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    type: text("type", {
      enum: ["sync_repo", "sync_pr", "generate_guide", "slack_digest", "sync_user_repos", "auto_assign", "weekly_report", "apply_rules", "sync_issues", "sync_issue", "inbox_event", "review_deadline", "release_readiness"],
    }).notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status", { enum: ["queued", "running", "done", "failed"] })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: timestamptz("run_after").defaultNow().notNull(),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [index("jobs_ready_idx").on(t.status, t.runAfter)],
);
