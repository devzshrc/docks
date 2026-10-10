import { index, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers.js";

export const deployMark = pgTable(
  "deploy_mark",
  {
    id: text("id").primaryKey(),
    sha: text("sha").notNull(),
    environment: text("environment").notNull(),
    actor: text("actor").notNull(),
    runUrl: text("run_url").notNull(),
    at: timestamptz("at").defaultNow().notNull(),
  },
  (t) => [index("deploy_mark_at_idx").on(t.at)],
);
