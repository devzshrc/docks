import { bigint, boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers.js";

export const AI_OUTCOMES = ["ok", "failed", "refused", "incomplete", "unparseable", "cached"] as const;
/** Metadata only: never retain prompts, source code, questions, or provider error bodies. */
export const aiCall = pgTable("ai_call", {
  id: uuid("id").defaultRandom().primaryKey(),
  at: timestamptz("at").defaultNow().notNull(),
  workspaceId: text("workspace_id"),
  repoId: bigint("repo_id", { mode: "number" }),
  operation: text("operation").$type<"guide" | "ask">().notNull(),
  model: text("model").notNull(),
  outcome: text("outcome").$type<(typeof AI_OUTCOMES)[number]>().notNull(),
  /** Null means the provider did not report usage; a cache hit has zero usage. */
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  latencyMs: integer("latency_ms").notNull(),
  cached: boolean("cached").notNull().default(false),
}, (t) => [index("ai_call_at_idx").on(t.at), index("ai_call_workspace_at_idx").on(t.workspaceId, t.at)]);
