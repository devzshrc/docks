import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  or,
} from "drizzle-orm";
import { z } from "zod";
import { assertMember, repoForUser, visibleRepos } from "../access.js";
import { protectedProcedure, router } from "../trpc.js";

const ws = z.object({ workspaceId: z.string() });
const itemInput = z.object({ id: z.string().uuid() });
const unread = () =>
  or(
    isNull(schema.inboxItem.readAt),
    lte(schema.inboxItem.remindAt, new Date()),
  );
const due = () =>
  or(
    isNull(schema.inboxItem.remindAt),
    lte(schema.inboxItem.remindAt, new Date()),
  );
async function repos(userId: string, workspaceId: string) {
  const member = await assertMember(userId, workspaceId);
  return visibleRepos(userId, workspaceId, member.repoIds);
}
async function ownItem(userId: string, id: string) {
  const [row] = await db
    .select({ repo: schema.repository.fullName })
    .from(schema.inboxItem)
    .innerJoin(
      schema.reviewEvent,
      eq(schema.inboxItem.eventId, schema.reviewEvent.id),
    )
    .innerJoin(
      schema.repository,
      eq(schema.reviewEvent.repoId, schema.repository.id),
    )
    .where(
      and(
        eq(schema.inboxItem.id, id),
        eq(schema.inboxItem.userId, userId),
        eq(schema.repository.enabled, true),
      ),
    );
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Inbox item not found" });
  await repoForUser(userId, row.repo);
}
const select = () =>
  db
    .select({
      id: schema.inboxItem.id,
      readAt: schema.inboxItem.readAt,
      remindAt: schema.inboxItem.remindAt,
      createdAt: schema.inboxItem.createdAt,
      kind: schema.reviewEvent.kind,
      context: schema.reviewEvent.context,
      occurredAt: schema.reviewEvent.occurredAt,
      repo: schema.repository.fullName,
      repoId: schema.repository.id,
      number: schema.reviewEvent.prNumber,
      title: schema.pullRequest.title,
    })
    .from(schema.inboxItem)
    .innerJoin(
      schema.reviewEvent,
      eq(schema.inboxItem.eventId, schema.reviewEvent.id),
    )
    .innerJoin(
      schema.repository,
      eq(schema.reviewEvent.repoId, schema.repository.id),
    )
    .innerJoin(
      schema.pullRequest,
      and(
        eq(schema.pullRequest.repoId, schema.reviewEvent.repoId),
        eq(schema.pullRequest.number, schema.reviewEvent.prNumber),
      ),
    );

export const inboxRouter = router({
  list: protectedProcedure
    .input(
      ws.extend({
        view: z.enum(["unread", "all", "snoozed"]).default("unread"),
        repoId: z.number().optional(),
        kind: z.enum(schema.INBOX_KINDS).optional(),
        cursor: z.object({ at: z.date(), id: z.string().uuid() }).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const visible = await repos(ctx.user.id, input.workspaceId);
      const ids = visible
        .filter((r) => !input.repoId || r.id === input.repoId)
        .map((r) => r.id);
      if (!ids.length) return { items: [], repos: visible, nextCursor: null };
      const items = await select()
        .where(
          and(
            eq(schema.inboxItem.userId, ctx.user.id),
            inArray(schema.reviewEvent.repoId, ids),
            isNull(schema.inboxItem.dismissedAt),
            eq(schema.pullRequest.state, "open"),
            input.view === "snoozed"
              ? gt(schema.inboxItem.remindAt, new Date())
              : due(),
            input.view === "unread" ? unread() : undefined,
            input.kind ? eq(schema.reviewEvent.kind, input.kind) : undefined,
            input.cursor
              ? or(
                  lt(schema.inboxItem.createdAt, input.cursor.at),
                  and(
                    eq(schema.inboxItem.createdAt, input.cursor.at),
                    lt(schema.inboxItem.id, input.cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(schema.inboxItem.createdAt), desc(schema.inboxItem.id))
        .limit(31);
      const more = items.length > 30;
      const page = items.slice(0, 30);
      const last = page.at(-1);
      return {
        items: page,
        repos: visible,
        nextCursor: more && last ? { at: last.createdAt, id: last.id } : null,
      };
    }),
  unreadCount: protectedProcedure.input(ws).query(async ({ ctx, input }) => {
    const ids = (await repos(ctx.user.id, input.workspaceId)).map((r) => r.id);
    if (!ids.length) return 0;
    const [row] = await db
      .select({ n: count() })
      .from(schema.inboxItem)
      .innerJoin(
        schema.reviewEvent,
        eq(schema.inboxItem.eventId, schema.reviewEvent.id),
      )
      .innerJoin(
        schema.pullRequest,
        and(
          eq(schema.pullRequest.repoId, schema.reviewEvent.repoId),
          eq(schema.pullRequest.number, schema.reviewEvent.prNumber),
        ),
      )
      .where(
        and(
          eq(schema.inboxItem.userId, ctx.user.id),
          inArray(schema.reviewEvent.repoId, ids),
          isNull(schema.inboxItem.dismissedAt),
          eq(schema.pullRequest.state, "open"),
          due(),
          unread(),
        ),
      );
    return row?.n ?? 0;
  }),
  markRead: protectedProcedure
    .input(itemInput)
    .mutation(async ({ ctx, input }) => {
      await ownItem(ctx.user.id, input.id);
      await db
        .update(schema.inboxItem)
        .set({ readAt: new Date(), remindAt: null })
        .where(
          and(
            eq(schema.inboxItem.id, input.id),
            eq(schema.inboxItem.userId, ctx.user.id),
          ),
        );
    }),
  dismiss: protectedProcedure
    .input(itemInput)
    .mutation(async ({ ctx, input }) => {
      await ownItem(ctx.user.id, input.id);
      await db
        .update(schema.inboxItem)
        .set({ dismissedAt: new Date(), remindAt: null })
        .where(
          and(
            eq(schema.inboxItem.id, input.id),
            eq(schema.inboxItem.userId, ctx.user.id),
          ),
        );
    }),
  remind: protectedProcedure
    .input(
      itemInput.extend({
        at: z
          .date()
          .refine(
            (d) =>
              d.getTime() > Date.now() &&
              d.getTime() < Date.now() + 30 * 86400_000,
            "Choose a future date within 30 days",
          ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ownItem(ctx.user.id, input.id);
      await db
        .update(schema.inboxItem)
        .set({ readAt: new Date(), dismissedAt: null, remindAt: input.at })
        .where(
          and(
            eq(schema.inboxItem.id, input.id),
            eq(schema.inboxItem.userId, ctx.user.id),
          ),
        );
    }),
});
