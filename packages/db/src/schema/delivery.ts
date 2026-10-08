import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps, timestamptz } from "./_helpers.js";
import { repository } from "./github.js";
import { user } from "./auth.js";
import { workspace } from "./workspace.js";

export interface WorkSchedule {
  timezone: string;
  days: number[];
  startHour: number;
  endHour: number;
}
export interface DeadlineRules {
  hours: number;
  reminderHours: number;
  schedule: WorkSchedule;
  leadUserId: string;
}
export const reviewPolicy = pgTable("review_policy", {
  repoId: bigint("repo_id", { mode: "number" })
    .primaryKey()
    .references(() => repository.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  rules: jsonb("rules").$type<DeadlineRules>().notNull(),
  ...timestamps,
});
export const reviewCycle = pgTable(
  "review_cycle",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repoId: bigint("repo_id", { mode: "number" })
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    kind: text("kind", { enum: ["first", "changes"] }).notNull(),
    reviewer: text("reviewer").notNull(),
    headSha: text("head_sha").notNull(),
    sourceKey: text("source_key").notNull().unique(),
    rules: jsonb("rules").$type<DeadlineRules>().notNull(),
    startedAt: timestamptz("started_at").notNull(),
    dueAt: timestamptz("due_at").notNull(),
    remindAt: timestamptz("remind_at").notNull(),
    pausedAt: timestamptz("paused_at"),
    remainingMinutes: integer("remaining_minutes"),
    completedAt: timestamptz("completed_at"),
    cancelledAt: timestamptz("cancelled_at"),
    cancelReason: text("cancel_reason"),
    backupLogin: text("backup_login"),
    ...timestamps,
  },
  (t) => [
    index("review_cycle_due_idx").on(t.dueAt),
    index("review_cycle_pr_idx").on(t.repoId, t.prNumber),
  ],
);
export const reviewDelivery = pgTable(
  "review_delivery",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => reviewCycle.id, { onDelete: "cascade" }),
    stage: text("stage", { enum: ["reminder", "overdue"] }).notNull(),
    inboxAt: timestamptz("inbox_at"),
    slackAt: timestamptz("slack_at"),
    skippedAt: timestamptz("skipped_at"),
    leaseUntil: timestamptz("lease_until"),
    ...timestamps,
  },
  (t) => [uniqueIndex("review_delivery_stage_idx").on(t.cycleId, t.stage)],
);
export const release = pgTable(
  "release",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetDate: timestamptz("target_date"),
    status: text("status", { enum: ["active", "completed"] })
      .notNull()
      .default("active"),
    ...timestamps,
  },
  (t) => [index("release_workspace_idx").on(t.workspaceId)],
);
export interface ReadinessSnapshot {
  state: "ready" | "blocked" | "unknown";
  headSha: string | null;
  checkedAt: string;
  blockers: { kind: string; title: string; url?: string }[];
  warnings: string[];
}
export const releasePr = pgTable(
  "release_pr",
  {
    releaseId: uuid("release_id")
      .notNull()
      .references(() => release.id, { onDelete: "cascade" }),
    repoId: bigint("repo_id", { mode: "number" })
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    readiness: jsonb("readiness").$type<ReadinessSnapshot>(),
    refreshRequestedAt: timestamptz("refresh_requested_at"),
  },
  (t) => [primaryKey({ columns: [t.releaseId, t.repoId, t.prNumber] })],
);
export interface EvidenceData {
  source: string;
  actor: string | null;
  headSha: string | null;
  reviews: {
    login: string;
    state: string;
    sha: string | null;
    at: string | null;
  }[];
  checks: { name: string; status: string; conclusion: string | null }[];
  mergeSha: string | null;
  gaps: string[];
}
export const reviewEvidence = pgTable(
  "review_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repoId: bigint("repo_id", { mode: "number" })
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    sourceKey: text("source_key").notNull().unique(),
    kind: text("kind", { enum: ["review", "merge"] }).notNull(),
    occurredAt: timestamptz("occurred_at").notNull(),
    collectedAt: timestamptz("collected_at").defaultNow().notNull(),
    data: jsonb("data").$type<EvidenceData>().notNull(),
  },
  (t) => [
    index("review_evidence_pr_idx").on(t.repoId, t.prNumber, t.occurredAt),
  ],
);
