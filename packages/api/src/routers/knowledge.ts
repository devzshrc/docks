import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { audit, can, repoForAction, repoForUser } from "../access.js";
import { protectedProcedure, router } from "../trpc.js";

const repo = z.object({ repo: z.string().min(3).max(200) });
const document = repo.extend({ id: z.string().uuid() });
const content = {
  title: z.string().trim().min(1).max(150),
  category: z.enum(["architecture", "conventions", "testing", "review"]),
  body: z.string().trim().min(1).max(20000),
  archived: z.boolean().default(false),
};
export const knowledgeRouter = router({
  list: protectedProcedure
    .input(
      repo.extend({
        search: z.string().max(100).default(""),
        archived: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const r = await repoForUser(ctx.user.id, input.repo);
      const search = input.search.replace(/[\\%_]/g, "\\$&");
      const documents = await db
        .select()
        .from(schema.repositoryKnowledge)
        .where(
          and(
            eq(schema.repositoryKnowledge.repoId, r.id),
            eq(schema.repositoryKnowledge.archived, input.archived),
            search
              ? or(
                  ilike(schema.repositoryKnowledge.title, `%${search}%`),
                  ilike(schema.repositoryKnowledge.body, `%${search}%`),
                )
              : undefined,
          ),
        )
        .orderBy(desc(schema.repositoryKnowledge.updatedAt))
        .limit(100);
      return { documents, canEdit: can(r.role, "repos.manage") };
    }),
  revisions: protectedProcedure
    .input(document)
    .query(async ({ ctx, input }) => {
      const r = await repoForUser(ctx.user.id, input.repo);
      const [d] = await db
        .select()
        .from(schema.repositoryKnowledge)
        .where(
          and(
            eq(schema.repositoryKnowledge.id, input.id),
            eq(schema.repositoryKnowledge.repoId, r.id),
          ),
        );
      if (!d) throw new TRPCError({ code: "NOT_FOUND" });
      return db
        .select()
        .from(schema.repositoryKnowledgeRevision)
        .where(eq(schema.repositoryKnowledgeRevision.documentId, d.id))
        .orderBy(desc(schema.repositoryKnowledgeRevision.version))
        .limit(100);
    }),
  save: protectedProcedure
    .input(
      repo.extend({
        id: z.string().uuid().optional(),
        expectedVersion: z.number().int().positive().optional(),
        ...content,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const r = await repoForAction(ctx.user.id, input.repo, "repos.manage");
      const saved = await db.transaction(async (tx) => {
        const values = {
          title: input.title,
          category: input.category,
          body: input.body,
          archived: input.archived,
          updatedAt: new Date(),
        };
        let row;
        if (input.id) {
          if (!input.expectedVersion)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Document revision is required",
            });
          [row] = await tx
            .update(schema.repositoryKnowledge)
            .set({ ...values, version: input.expectedVersion + 1 })
            .where(
              and(
                eq(schema.repositoryKnowledge.id, input.id),
                eq(schema.repositoryKnowledge.repoId, r.id),
                eq(schema.repositoryKnowledge.version, input.expectedVersion),
              ),
            )
            .returning();
          if (!row)
            throw new TRPCError({
              code: "CONFLICT",
              message: "This document changed. Reload before saving.",
            });
        } else
          [row] = await tx
            .insert(schema.repositoryKnowledge)
            .values({ repoId: r.id, ...values })
            .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await tx
          .insert(schema.repositoryKnowledgeRevision)
          .values({
            documentId: row.id,
            version: row.version,
            title: row.title,
            category: row.category,
            body: row.body,
            archived: row.archived,
            authorId: ctx.user.id,
          });
        return row;
      });
      await audit(r.workspaceId, ctx.user.id, "knowledge.save", saved.id, {
        version: saved.version,
        archived: saved.archived,
      });
      return saved;
    }),
});
