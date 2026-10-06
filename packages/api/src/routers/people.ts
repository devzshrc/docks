import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertCan, assertMember, audit, can } from "../access.js";
import { protectedProcedure, router } from "../trpc.js";

/** Teams, member profiles and review load (plan M3/M4). */

const ws = z.object({ workspaceId: z.string() });

/**
 * Open review requests per GitHub login across the workspace's enabled repos:
 * how many are waiting on them and since when. Drafts don't count.
 */
export async function reviewLoad(workspaceId: string) {
  const rows = await db.execute<{ login: string; open: number; oldest: Date | null }>(sql`
    SELECT r.login, count(*)::int AS open, min(p.last_activity_at) AS oldest
    FROM ${schema.pullRequest} p
    JOIN ${schema.repository} repo ON repo.id = p.repo_id AND repo.enabled
    JOIN ${schema.githubInstallation} gi ON gi.id = repo.installation_id
    CROSS JOIN LATERAL unnest(p.requested_reviewers) AS r(login)
    WHERE gi.workspace_id = ${workspaceId} AND p.state = 'open' AND NOT p.draft
    GROUP BY r.login
  `);
  return new Map(rows.rows.map((r) => [r.login, { open: r.open, oldest: r.oldest ? new Date(r.oldest) : null }]));
}

async function teamInWorkspace(teamId: string) {
  const [t] = await db.select().from(schema.team).where(eq(schema.team.id, teamId));
  if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
  return t;
}

const today = () => new Date().toISOString().slice(0, 10);

export const peopleRouter = router({
  /** Members with profile fields, teams and current review load. */
  list: protectedProcedure.input(ws).query(async ({ ctx, input }) => {
    await assertMember(ctx.user.id, input.workspaceId);
    const [members, teams, load] = await Promise.all([
      db
        .select({
          userId: schema.user.id,
          name: schema.user.name,
          image: schema.user.image,
          role: schema.workspaceMember.role,
          githubLogin: schema.githubIdentity.githubLogin,
          awayUntil: schema.workspaceMember.awayUntil,
          expertise: schema.workspaceMember.expertise,
          maxOpenReviews: schema.workspaceMember.maxOpenReviews,
        })
        .from(schema.workspaceMember)
        .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
        .leftJoin(schema.githubIdentity, eq(schema.githubIdentity.userId, schema.user.id))
        .where(eq(schema.workspaceMember.workspaceId, input.workspaceId))
        .orderBy(asc(schema.user.name)),
      db
        .select({ teamId: schema.team.id, teamName: schema.team.name, userId: schema.teamMember.userId })
        .from(schema.team)
        .leftJoin(schema.teamMember, eq(schema.teamMember.teamId, schema.team.id))
        .where(eq(schema.team.workspaceId, input.workspaceId)),
      reviewLoad(input.workspaceId),
    ]);
    const now = today();
    return members.map((m) => {
      const l = m.githubLogin ? load.get(m.githubLogin) : undefined;
      return {
        ...m,
        away: Boolean(m.awayUntil && m.awayUntil >= now),
        teams: teams.filter((t) => t.userId === m.userId).map((t) => ({ id: t.teamId, name: t.teamName })),
        openReviews: l?.open ?? 0,
        oldestWaitingSince: l?.oldest ?? null,
        overLimit: m.maxOpenReviews !== null && (l?.open ?? 0) >= m.maxOpenReviews,
      };
    });
  }),

  teams: protectedProcedure.input(ws).query(async ({ ctx, input }) => {
    await assertMember(ctx.user.id, input.workspaceId);
    const rows = await db
      .select({ id: schema.team.id, name: schema.team.name, userId: schema.teamMember.userId })
      .from(schema.team)
      .leftJoin(schema.teamMember, eq(schema.teamMember.teamId, schema.team.id))
      .where(eq(schema.team.workspaceId, input.workspaceId))
      .orderBy(asc(schema.team.name));
    const byId = new Map<string, { id: string; name: string; userIds: string[] }>();
    for (const r of rows) {
      const t = byId.get(r.id) ?? { id: r.id, name: r.name, userIds: [] };
      if (r.userId) t.userIds.push(r.userId);
      byId.set(r.id, t);
    }
    return [...byId.values()];
  }),

  createTeam: protectedProcedure
    .input(ws.extend({ name: z.string().trim().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "members.manage");
      const id = randomUUID();
      await db.insert(schema.team).values({ id, workspaceId: input.workspaceId, name: input.name });
      await audit(input.workspaceId, ctx.user.id, "team.create", input.name);
      return { id };
    }),

  renameTeam: protectedProcedure
    .input(z.object({ teamId: z.string(), name: z.string().trim().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const t = await teamInWorkspace(input.teamId);
      await assertCan(ctx.user.id, t.workspaceId, "members.manage");
      await db.update(schema.team).set({ name: input.name }).where(eq(schema.team.id, t.id));
      await audit(t.workspaceId, ctx.user.id, "team.rename", t.name, { name: input.name });
    }),

  deleteTeam: protectedProcedure.input(z.object({ teamId: z.string() })).mutation(async ({ ctx, input }) => {
    const t = await teamInWorkspace(input.teamId);
    await assertCan(ctx.user.id, t.workspaceId, "members.manage");
    await db.delete(schema.team).where(eq(schema.team.id, t.id));
    await audit(t.workspaceId, ctx.user.id, "team.delete", t.name);
  }),

  setTeamMembers: protectedProcedure
    .input(z.object({ teamId: z.string(), userIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const t = await teamInWorkspace(input.teamId);
      await assertCan(ctx.user.id, t.workspaceId, "members.manage");
      // Only workspace members can be on a team.
      const valid = input.userIds.length
        ? (
            await db
              .select({ userId: schema.workspaceMember.userId })
              .from(schema.workspaceMember)
              .where(
                and(
                  eq(schema.workspaceMember.workspaceId, t.workspaceId),
                  inArray(schema.workspaceMember.userId, input.userIds),
                ),
              )
          ).map((r) => r.userId)
        : [];
      await db.transaction(async (tx) => {
        await tx.delete(schema.teamMember).where(eq(schema.teamMember.teamId, t.id));
        if (valid.length) await tx.insert(schema.teamMember).values(valid.map((userId) => ({ teamId: t.id, userId })));
      });
      await audit(t.workspaceId, ctx.user.id, "team.members", t.name, { count: valid.length });
    }),

  /** People edit their own availability and expertise; admins can edit anyone's. */
  updateMember: protectedProcedure
    .input(
      ws.extend({
        userId: z.string(),
        awayUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        expertise: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).optional(),
        maxOpenReviews: z.number().int().min(1).max(50).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) await assertMember(ctx.user.id, input.workspaceId);
      else await assertCan(ctx.user.id, input.workspaceId, "members.manage");
      const { workspaceId, userId, ...set } = input;
      if (set.expertise) set.expertise = [...new Set(set.expertise)];
      if (!Object.keys(set).length) return;
      await db
        .update(schema.workspaceMember)
        .set(set)
        .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, userId)));
      await audit(workspaceId, ctx.user.id, "member.profile", userId, set);
    }),

  /** Profile page: who they are, what's waiting on them, what they did lately. */
  person: protectedProcedure.input(ws.extend({ userId: z.string() })).query(async ({ ctx, input }) => {
    const me = await assertMember(ctx.user.id, input.workspaceId);
    const [m] = await db
      .select({
        userId: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        image: schema.user.image,
        role: schema.workspaceMember.role,
        githubLogin: schema.githubIdentity.githubLogin,
        awayUntil: schema.workspaceMember.awayUntil,
        expertise: schema.workspaceMember.expertise,
        maxOpenReviews: schema.workspaceMember.maxOpenReviews,
        joinedAt: schema.workspaceMember.createdAt,
      })
      .from(schema.workspaceMember)
      .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
      .leftJoin(schema.githubIdentity, eq(schema.githubIdentity.userId, schema.user.id))
      .where(and(eq(schema.workspaceMember.workspaceId, input.workspaceId), eq(schema.workspaceMember.userId, input.userId)));
    if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Not a member of this workspace" });

    const teams = await db
      .select({ id: schema.team.id, name: schema.team.name })
      .from(schema.teamMember)
      .innerJoin(schema.team, eq(schema.team.id, schema.teamMember.teamId))
      .where(and(eq(schema.teamMember.userId, m.userId), eq(schema.team.workspaceId, input.workspaceId)));

    const repoScope = sql`p.repo_id IN (
      SELECT repo.id FROM ${schema.repository} repo
      JOIN ${schema.githubInstallation} gi ON gi.id = repo.installation_id
      WHERE gi.workspace_id = ${input.workspaceId} AND repo.enabled)`;
    const login = m.githubLogin;
    const [waiting, recentReviews, authored] = login
      ? await Promise.all([
          db.execute<{ repo: string; number: number; title: string; since: Date }>(sql`
            SELECT repo.full_name AS repo, p.number, p.title, p.last_activity_at AS since
            FROM ${schema.pullRequest} p JOIN ${schema.repository} repo ON repo.id = p.repo_id
            WHERE ${repoScope} AND p.state = 'open' AND ${login} = ANY(p.requested_reviewers)
            ORDER BY p.last_activity_at LIMIT 20`),
          db.execute<{ repo: string; number: number; title: string; state: string; at: Date }>(sql`
            SELECT repo.full_name AS repo, p.number, p.title, r.state, r.submitted_at AS at
            FROM ${schema.prReview} r
            JOIN ${schema.pullRequest} p ON p.repo_id = r.repo_id AND p.number = r.pr_number
            JOIN ${schema.repository} repo ON repo.id = p.repo_id
            WHERE ${repoScope} AND r.reviewer_login = ${login}
            ORDER BY r.submitted_at DESC LIMIT 15`),
          db.execute<{ repo: string; number: number; title: string; state: string }>(sql`
            SELECT repo.full_name AS repo, p.number, p.title, p.state
            FROM ${schema.pullRequest} p JOIN ${schema.repository} repo ON repo.id = p.repo_id
            WHERE ${repoScope} AND p.author_login = ${login}
            ORDER BY p.last_activity_at DESC LIMIT 15`),
        ])
      : [{ rows: [] }, { rows: [] }, { rows: [] }];

    return {
      ...m,
      email: can(me.role, "members.manage") || m.userId === ctx.user.id ? m.email : null,
      away: Boolean(m.awayUntil && m.awayUntil >= today()),
      teams,
      waitingOnThem: waiting.rows,
      recentReviews: recentReviews.rows,
      authored: authored.rows,
      canEdit: m.userId === ctx.user.id || can(me.role, "members.manage"),
    };
  }),
});
