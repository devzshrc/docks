import {
  bigint,
  integer,
  jsonb,
  pgTable,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { text } from "drizzle-orm/pg-core";
import { timestamps } from "./_helpers.js";
import { user } from "./auth.js";
import { repository } from "./github.js";

export interface ReviewSessionData {
  /** Draft keys identify a summary, line composer, or thread reply. */
  textDrafts: Record<string, string>;
  pending: {
    id: string;
    path: string;
    line: number;
    startLine?: number;
    side: "LEFT" | "RIGHT";
    body: string;
    headSha: string;
  }[];
  checklist: { revision: string; checked: string[]; answers?: Record<string, { headSha: string; files: Record<string, string> }> };
  lastLocation: { path: string; line?: number } | null;
}

/** Private per-person recovery state. Version protects against saves from a stale browser. */
export const reviewSession = pgTable(
  "review_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repoId: bigint("repo_id", { mode: "number" })
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    version: integer("version").notNull().default(1),
    data: jsonb("data").$type<ReviewSessionData>().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("review_sessions_owner_pr_idx").on(
      t.userId,
      t.repoId,
      t.prNumber,
    ),
  ],
);
