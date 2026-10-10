import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers.js";

/**
 * Grouped server errors (observability Phase 1).
 * One row per normalized error message: `hash` is sha256 of the message with
 * digits/hex/uuids stripped so repeat instances of the same bug increment
 * `total` instead of inserting new rows. `stack` keeps the most recent full
 * stack and is only ever returned by the admin-only `admin.errors` procedure.
 */
export const serverError = pgTable(
  "server_error",
  {
    hash: text("hash").primaryKey(),
    message: text("message").notNull(),
    stack: text("stack"),
    total: integer("total").notNull().default(1),
    firstAt: timestamptz("first_at").defaultNow().notNull(),
    lastAt: timestamptz("last_at").defaultNow().notNull(),
  },
  (t) => [index("server_error_last_at_idx").on(t.lastAt)],
);
