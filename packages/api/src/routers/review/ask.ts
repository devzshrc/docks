import { diffCitations } from "../../review/ask-context.js";
import { logError } from "../../logger.js";
import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { repoForUser } from "../../access.js";
import { askQuotaError, askUsageQuery } from "../../review/ask-quota.js";
import { answerQuestion } from "../../review/ask-service.js";
import { protectedProcedure } from "../../trpc.js";
import { headShaOf, pr } from "./shared.js";

/** Ask the PR: saved questions and answers. */
export const askProcedures = {
  questions: protectedProcedure.input(pr).query(async ({ ctx, input }) => {
    const r = await repoForUser(ctx.user.id, input.repo);
    const { headSha } = await headShaOf(r.id, input.number);
    const questions = await db
      .select()
      .from(schema.reviewQuestion)
      .where(
        and(
          eq(schema.reviewQuestion.userId, ctx.user.id),
          eq(schema.reviewQuestion.repoId, r.id),
          eq(schema.reviewQuestion.prNumber, input.number),
        ),
      )
      .orderBy(desc(schema.reviewQuestion.createdAt))
      .limit(50);
    return { headSha, questions: questions.reverse() };
  }),
  /** Ask a question about the PR; viewers can ask too. */
  ask: protectedProcedure
    .input(
      pr.extend({
        question: z.string().trim().min(1).max(2000),
        path: z.string().max(500).optional(),
        line: z.number().int().positive().optional(),
        knowledgeIds: z.array(z.string().uuid()).max(3).default([]),
        stream: z.boolean().default(false),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().max(8000),
            }),
          )
          .max(20)
          .default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const repoRow = await repoForUser(ctx.user.id, input.repo);
      const { headSha } = await headShaOf(repoRow.id, input.number);
      const files = await db
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
            eq(schema.prFile.repoId, repoRow.id),
            eq(schema.prFile.prNumber, input.number),
            eq(schema.prFile.headSha, headSha),
          ),
        );
      try {
        const [aiRepo] = await db
          .select({ enabled: schema.repository.aiEnabled })
          .from(schema.repository)
          .where(eq(schema.repository.id, repoRow.id));
        if (!aiRepo?.enabled)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "AI is disabled for this repository",
          });
        const scoped = input.path
          ? files.filter((f) => f.filename === input.path)
          : files;
        if (!scoped.length)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No diff is available for this selection yet",
          });
        if (
          input.line &&
          (!input.path ||
            !diffCitations(`${input.path}:${input.line}`, scoped).length)
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a new-side line present in this diff",
          });
        const contextualQuestion = input.line
          ? `${input.question}\nFocus on ${input.path}:${input.line} on the new side of the diff.`
          : input.question;
        const knowledge = input.knowledgeIds.length
          ? await db
              .select()
              .from(schema.repositoryKnowledge)
              .where(
                and(
                  eq(schema.repositoryKnowledge.repoId, repoRow.id),
                  eq(schema.repositoryKnowledge.archived, false),
                  inArray(schema.repositoryKnowledge.id, input.knowledgeIds),
                ),
              )
          : [];
        if (knowledge.length !== input.knowledgeIds.length)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A selected knowledge document is unavailable",
          });
        const reservation = await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ask:${ctx.user.id}`}, 0))`,
          );
          const [usage] = await askUsageQuery(tx, ctx.user.id);
          const overQuota = askQuotaError(usage);
          if (overQuota) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: overQuota });
          const [row] = await tx
            .insert(schema.reviewQuestion)
            .values({
              userId: ctx.user.id,
              repoId: repoRow.id,
              prNumber: input.number,
              headSha,
              question: contextualQuestion,
              answer: "Answer pending",
              status: "pending",
              path: input.path,
              citations: [],
              knowledge: knowledge.map((k) => ({
                id: k.id,
                version: k.version,
                title: k.title,
              })),
            })
            .returning();
          return row!;
        });
        // Streaming clients open GET /ask/:id/stream for the answer; others wait here.
        if (input.stream) return reservation;
        return await answerQuestion(reservation.id);
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        logError("ask.failed", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Couldn't get an answer right now. Try again.",
        });
      }
    }),
};
