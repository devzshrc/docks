import { index, jsonb, pgTable, serial, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers.js";

/**
 * Product analytics (plan M8): our own append-only events, no third-party
 * tracker. user/workspace ids are plain text so deleting either keeps the
 * aggregate history (no personal data beyond the id).
 */
export const event = pgTable(
  "event",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"),
    workspaceId: text("workspace_id"),
    name: text("name").notNull(),
    props: jsonb("props"),
    at: timestamptz("at").defaultNow().notNull(),
  },
  (t) => [index("event_name_at_idx").on(t.name, t.at), index("event_user_idx").on(t.userId, t.name)],
);
