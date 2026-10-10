import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./_helpers.js";
import { user } from "./auth.js";
import { workspace } from "./workspace.js";

export const accountControl = pgTable("account_control", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  suspendedAt: timestamptz("suspended_at"),
  reason: text("reason"),
  updatedBy: text("updated_by").notNull(),
});
export const premiumGrant = pgTable(
  "premium_grant",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull(),
    reason: text("reason").notNull(),
    startsAt: timestamptz("starts_at").defaultNow().notNull(),
    expiresAt: timestamptz("expires_at"),
    revokedAt: timestamptz("revoked_at"),
  },
  (t) => [index("premium_grant_workspace_idx").on(t.workspaceId)],
);
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    reason: text("reason").notNull(),
    requestId: text("request_id").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    at: timestamptz("at").defaultNow().notNull(),
  },
  (t) => [
    index("admin_audit_at_idx").on(t.at),
    index("admin_audit_target_idx").on(t.target),
  ],
);
export const authEvent = pgTable(
  "auth_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["login", "login_failed"] }).notNull(),
    at: timestamptz("at").defaultNow().notNull(),
  },
  (t) => [
    index("auth_event_at_idx").on(t.at),
    index("auth_event_user_idx").on(t.userId, t.at),
  ],
);
