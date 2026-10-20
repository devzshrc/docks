import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps, timestamptz } from "./_helpers.js";
import { repository } from "./github.js";
import { user } from "./auth.js";

export const repositoryKnowledge = pgTable(
  "repository_knowledge",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repoId: bigint("repo_id", { mode: "number" })
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull(),
    body: text("body").notNull(),
    version: integer("version").notNull().default(1),
    archived: boolean("archived").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("repository_knowledge_repo_idx").on(t.repoId)],
);
export const repositoryKnowledgeRevision = pgTable(
  "repository_knowledge_revision",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => repositoryKnowledge.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    body: text("body").notNull(),
    archived: boolean("archived").notNull(),
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("repository_knowledge_revision_version_idx").on(
      t.documentId,
      t.version,
    ),
  ],
);
export interface AskCitation {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  /** LEFT only: GitHub PR files-view anchor (diff-<sha256(path)>L<line>); old lines have no head permalink. */
  anchor?: string;
}
export const reviewQuestion = pgTable(
  "review_question",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repoId: bigint("repo_id", { mode: "number" })
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    headSha: text("head_sha").notNull(),
    status: text("status")
      .$type<"pending" | "completed" | "failed">()
      .notNull()
      .default("completed"),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    path: text("path"),
    citations: jsonb("citations").$type<AskCitation[]>().notNull(),
    knowledge: jsonb("knowledge")
      .$type<{ id: string; version: number; title: string }[]>()
      .notNull(),
    ...timestamps,
  },
  (t) => [
    index("review_question_owner_pr_idx").on(t.userId, t.repoId, t.prNumber),
  ],
);
export const reviewFollowUp = pgTable(
  "review_follow_up",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repoId: bigint("repo_id", { mode: "number" })
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    headSha: text("head_sha").notNull(),
    commentId: bigint("comment_id", { mode: "number" }),
    path: text("path"),
    line: integer("line"),
    targetRepoId: bigint("target_repo_id", { mode: "number" })
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    issueNumber: integer("issue_number").notNull(),
    creationId: uuid("creation_id").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("review_follow_up_creation_idx").on(t.creationId),
    index("review_follow_up_pr_idx").on(t.repoId, t.prNumber),
  ],
);

export const reviewInboxState = pgTable(
  "review_inbox_state",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repoId: bigint("repo_id", { mode: "number" })
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    snoozedUntil: timestamptz("snoozed_until"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("review_inbox_state_owner_pr_idx").on(
      t.userId,
      t.repoId,
      t.prNumber,
    ),
  ],
);
