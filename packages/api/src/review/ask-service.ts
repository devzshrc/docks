import { db, schema } from "@docks/db";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { repoForUser } from "../access.js";
import { logError } from "../logger.js";
import { askPr } from "./ask.js";
import { budgetFiles, diffCitations, pickContextFiles, relativeImports } from "./ask-context.js";
import { cached } from "../cache.js";
import { GitHubError, installationClient } from "./github.js";

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
        .select({
          workspaceId: schema.githubInstallation.workspaceId,
          installationId: schema.repository.installationId,
          fullName: schema.repository.fullName,
        })
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
          status: schema.prFile.status,
        })
        .from(schema.prFile)
        .where(
          and(
            eq(schema.prFile.repoId, q.repoId),
            eq(schema.prFile.prNumber, q.prNumber),
            eq(schema.prFile.headSha, q.headSha),
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
    const scoped = q.path ? files.filter((f) => f.filename === q.path) : files;
    const fullFiles = repo ? await contextFiles(repo, q.headSha, files, q.path) : [];
    const answer = await askPr(
      {
        title: pull?.title ?? "",
        body: pull?.body ?? null,
        files: scoped,
        fullFiles,
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
      .set({ answer, citations: diffCitations(answer, scoped), status: "completed", updatedAt: new Date() })
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

/**
 * Whole files for context: the selected (or biggest) changed files at the head
 * commit, plus up to three files the first one imports. Cached per commit;
 * anything GitHub can't return is skipped rather than failing the answer.
 */
async function contextFiles(
  repo: { installationId: number; fullName: string },
  headSha: string,
  files: Parameters<typeof pickContextFiles>[0],
  selected: string | null,
): Promise<{ path: string; content: string }[]> {
  const gh = installationClient(repo.installationId);
  let attempts = 0; // GitHub reads per question, including import guesses that miss
  const read = (path: string) =>
    ++attempts > 12
      ? Promise.resolve(null)
      : cached(`file:${repo.fullName}@${headSha}:${path}`, 24 * 3_600_000, async () => {
      try {
        return await gh.fileContent(repo.fullName, path, headSha);
      } catch (err) {
        if (err instanceof GitHubError && err.status === 404) return null;
        throw err;
      }
    }).catch(() => null);
  const picked = pickContextFiles(files, selected);
  const out: { path: string; content: string }[] = [];
  for (const path of picked) {
    const content = await read(path);
    if (content !== null) out.push({ path, content });
  }
  if (out[0]) {
    for (const candidates of relativeImports(out[0].path, out[0].content)) {
      if (candidates.some((c) => out.some((f) => f.path === c))) continue;
      for (const path of candidates) {
        const content = await read(path);
        if (content !== null) {
          out.push({ path, content });
          break;
        }
      }
    }
  }
  return budgetFiles(out);
}
