import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps, timestamptz } from "./_helpers.js";
import { user } from "./auth.js";
import { repository } from "./github.js";

export const INBOX_KINDS = [
  "review_requested",
  "new_commit",
  "thread_reply",
  "review_submitted",
  "check_failed",
  "review_reminder",
  "review_overdue",
] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];
export interface InboxContext {
  title: string;
  actor: string;
  headSha: string | null;
  url: string | null;
  requestedLogin: string | null;
  replyTo: number | null;
}

/** Minimal immutable webhook context. Jobs can retry without losing the event to a later PR sync. */
export const reviewEvent = pgTable("review_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  repoId: bigint("repo_id", { mode: "number" })
    .notNull()
    .references(() => repository.id, { onDelete: "cascade" }),
  prNumber: integer("pr_number").notNull(),
  sourceKey: text("source_key").notNull().unique(),
  kind: text("kind", { enum: INBOX_KINDS }).notNull(),
  context: jsonb("context").$type<InboxContext>().notNull(),
  occurredAt: timestamptz("occurred_at").notNull(),
  processedAt: timestamptz("processed_at"),
  ...timestamps,
});

export const inboxItem = pgTable(
  "inbox_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => reviewEvent.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    readAt: timestamptz("read_at"),
    dismissedAt: timestamptz("dismissed_at"),
    remindAt: timestamptz("remind_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("inbox_items_recipient_event_idx").on(t.userId, t.eventId),
    index("inbox_items_user_idx").on(t.userId, t.createdAt),
  ],
);
