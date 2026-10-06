import { bigint, boolean, date, index, integer, jsonb, pgTable, primaryKey, serial, text } from "drizzle-orm/pg-core";
import { timestamps, timestamptz } from "./_helpers.js";
import { user } from "./auth.js";

/** plan.md §8 — workspaces own GitHub installations, repos and billing. */
export const workspace = pgTable("workspace", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // Billing (plan.md §11). Dodo Payments is the source of truth; webhooks keep these in step.
  plan: text("plan", { enum: ["free", "team"] }).notNull().default("free"),
  billingCustomerId: text("billing_customer_id").unique(),
  billingSubscriptionId: text("billing_subscription_id").unique(),
  subscriptionStatus: text("subscription_status"),
  currentPeriodEnd: timestamptz("current_period_end"),
  require2fa: boolean("require_2fa").notNull().default(false),
  /** Hours without activity before a PR waiting on review counts as stuck. */
  stuckHours: integer("stuck_hours").notNull().default(24),
  ...timestamps,
});

/** Roles, least to most powerful. Permissions live in packages/api/src/access.ts. */
export const ROLES = ["viewer", "member", "billing", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

export const workspaceMember = pgTable(
  "workspace_member",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull().default("member"),
    /** null = every repo in the workspace; otherwise only these repository ids. */
    repoIds: bigint("repo_ids", { mode: "number" }).array(),
    /** Not reviewing until this date (inclusive); skipped by suggestions and auto-assign. */
    awayUntil: date("away_until", { mode: "string" }),
    /** Areas they know, e.g. "payments", "db"; matched against changed paths. */
    expertise: text("expertise").array().notNull().default([]),
    /** Soft cap on open review requests; null = no cap. */
    maxOpenReviews: integer("max_open_reviews"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

/** Shareable invite link. Only the SHA-256 of the token is stored. */
export const workspaceInvite = pgTable(
  "workspace_invite",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** Set for email invites: only this address can accept. Null for shareable links. */
    email: text("email"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamptz("expires_at").notNull(),
    revokedAt: timestamptz("revoked_at"),
    ...timestamps,
  },
  (t) => [index("workspace_invite_workspace_idx").on(t.workspaceId)],
);

/** Who did what, for admins (plan.md §11). Append-only. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(), // e.g. "member.role", "review.approve"
    target: text("target"), // e.g. "acme/web#418" or a user id
    meta: jsonb("meta"),
    at: timestamptz("at").defaultNow().notNull(),
  },
  (t) => [index("audit_log_workspace_idx").on(t.workspaceId, t.at)],
);

/** Groups of members (Frontend, Platform…) used by board filters, assignment and insights. */
export const team = pgTable(
  "team",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [index("team_workspace_idx").on(t.workspaceId)],
);

export const teamMember = pgTable(
  "team_member",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

/** A person's saved board filters (plan M5). `query` is the URL search string. */
export const savedView = pgTable(
  "saved_view",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    query: text("query").notNull(),
    ...timestamps,
  },
  (t) => [index("saved_view_user_idx").on(t.userId, t.workspaceId)],
);
