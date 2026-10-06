import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "./_helpers.js";
import { workspace } from "./workspace.js";

/**
 * plan.md §5.4 — daily stuck-PR digest via a Slack incoming webhook.
 * The channel is chosen on Slack's own OAuth screen; we can only post there.
 */
export const slackIntegration = pgTable("slack_integration", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  teamId: text("team_id").notNull(),
  teamName: text("team_name").notNull(),
  channelId: text("channel_id").notNull(),
  channelName: text("channel_name").notNull(),
  webhookUrlEncrypted: text("webhook_url_encrypted").notNull(),
  digestHour: integer("digest_hour").notNull().default(9),
  timezone: text("timezone").notNull().default("UTC"), // IANA, e.g. "Asia/Kolkata"
  lastDigestOn: text("last_digest_on"), // YYYY-MM-DD in `timezone`; one digest per day
  ...timestamps,
});
