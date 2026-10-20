import { db, schema } from "@docks/db";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { repoForUser } from "../access.js";
import { logError } from "../logger.js";
import { askPr } from "./ask.js";
import { diffCitations } from "./ask-context.js";

const PENDING = "Answer pending";
const STREAMING = "Answer streaming";

/** Owner check, current repository access (it can be revoked after asking), then claim. */
export async function startQuestionStream(questionId: string, userId: string) {
  const [q] = await db
    .select({ userId: schema.reviewQuestion.userId, fullName: schema.repository.fullName })
    .from(schema.reviewQuestion)
    .innerJoin(schema.repository, eq(schema.repository.id, schema.reviewQuestion.repoId))
    .where(eq(schema.reviewQuestion.id, questionId))
    .limit(1);
  if (!q || q.userId !== userId) return null;
  await repoForUser(userId, q.fullName);
  return claimQuestion(questionId, userId);
}

/**
 * Take a pending question for streaming. Only its owner can, and only once:
 * a second tab or a retry of the same id gets null.
 */
export async function claimQuestion(questionId: string, userId: string) {
  const [row] = await db
    .update(schema.reviewQuestion)
    .set({ answer: STREAMING, updatedAt: new Date() })
    .where(
      and(
        eq(schema.reviewQuestion.id, questionId),
        eq(schema.reviewQuestion.userId, userId),
        eq(schema.reviewQuestion.status, "pending"),
        eq(schema.reviewQuestion.answer, PENDING),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Answer a reserved question from what was saved with it: the commit, the
 * selected file, knowledge documents and this commit's earlier answers.
 * Marks it completed or failed; rethrows provider errors.
 */
export async function answerQuestion(questionId: string, onDelta?: (text: string) => void) {
  const [q] = await db.select().from(schema.reviewQuestion).where(eq(schema.reviewQuestion.id, questionId)).limit(1);
  if (!q) throw new Error("Question not found");
  try {
    const [[pull], [repo], files, knowledge, prior] = await Promise.all([
      db
        .select({ title: schema.pullRequest.title, body: schema.pullRequest.body })
        .from(schema.pullRequest)
        .where(and(eq(schema.pullRequest.repoId, q.repoId), eq(schema.pullRequest.number, q.prNumber))),
      db
        .select({ workspaceId: schema.githubInstallation.workspaceId })
        .from(schema.repository)
        .innerJoin(schema.githubInstallation, eq(schema.githubInstallation.id, schema.repository.installationId))
        .where(eq(schema.repository.id, q.repoId)),
      db
        .select({
          filename: schema.prFile.path,
          tier: schema.prFile.tier,
          patch: schema.prFile.patch,
          additions: schema.prFile.additions,
          deletions: schema.prFile.deletions,
        })
        .from(schema.prFile)
        .where(
          and(
            eq(schema.prFile.repoId, q.repoId),
            eq(schema.prFile.prNumber, q.prNumber),
            eq(schema.prFile.headSha, q.headSha),
            ...(q.path ? [eq(schema.prFile.path, q.path)] : []),
          ),
        ),
      q.knowledge.length
        ? db
            .select()
            .from(schema.repositoryKnowledge)
            .where(
              and(
                eq(schema.repositoryKnowledge.repoId, q.repoId),
                inArray(
                  schema.repositoryKnowledge.id,
                  q.knowledge.map((k) => k.id),
                ),
              ),
            )
        : Promise.resolve([]),
      db
        .select()
        .from(schema.reviewQuestion)
        .where(
          and(
            eq(schema.reviewQuestion.userId, q.userId),
            eq(schema.reviewQuestion.repoId, q.repoId),
            eq(schema.reviewQuestion.prNumber, q.prNumber),
            eq(schema.reviewQuestion.headSha, q.headSha),
            eq(schema.reviewQuestion.status, "completed"),
            ne(schema.reviewQuestion.id, q.id),
          ),
        )
        .orderBy(desc(schema.reviewQuestion.createdAt))
        .limit(5),
    ]);
    const answer = await askPr(
      {
        title: pull?.title ?? "",
        body: pull?.body ?? null,
        files,
        question: q.question,
        history: prior.reverse().flatMap((p) => [
          { role: "user" as const, content: p.question },
          { role: "assistant" as const, content: p.answer.slice(0, 8000) },
        ]),
        knowledge: knowledge.map((k) => ({ ...k, body: k.body.slice(0, 6000) })),
      },
      { workspaceId: repo?.workspaceId, repoId: q.repoId },
      onDelta,
    );
    const [saved] = await db
      .update(schema.reviewQuestion)
      .set({ answer, citations: diffCitations(answer, files), status: "completed", updatedAt: new Date() })
      .where(eq(schema.reviewQuestion.id, q.id))
      .returning();
    return saved!;
  } catch (err) {
    await db
      .update(schema.reviewQuestion)
      .set({ answer: "This question failed. Ask again to retry.", status: "failed", updatedAt: new Date() })
      .where(eq(schema.reviewQuestion.id, q.id));
    logError("ask.failed", err);
    throw err;
  }
}
