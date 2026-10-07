import { bigint, index, integer, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { repository } from "./github.js";
import { timestamps, timestamptz } from "./_helpers.js";

/** Mirror of a repo's GitHub issues (pull requests are excluded), kept fresh by webhooks and the sync_issues job. */
export const issue = pgTable(
  "issue",
  {
    repoId: bigint("repo_id", { mode: "number" })
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    state: text("state", { enum: ["open", "closed"] }).notNull(),
    /** completed, not_planned, duplicate, reopened (GitHub's own values). */
    stateReason: text("state_reason"),
    authorLogin: text("author_login").notNull(),
    assignees: text("assignees").array().notNull().default([]),
    labels: jsonb("labels").$type<{ name: string; color: string }[]>().notNull().default([]),
    milestone: text("milestone"),
    commentsCount: integer("comments_count").notNull().default(0),
    ghCreatedAt: timestamptz("gh_created_at").notNull(),
    ghUpdatedAt: timestamptz("gh_updated_at").notNull(),
    closedAt: timestamptz("closed_at"),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.repoId, t.number] }),
    index("issue_state_idx").on(t.repoId, t.state),
    index("issue_updated_idx").on(t.state, t.ghUpdatedAt),
  ],
);
