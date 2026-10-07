import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, desc, asc, eq, gte, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { cached } from "../cache.js";
import { assertMember, audit, repoForAction, repoForUser, visibleRepos } from "../access.js";
import { enqueue } from "../jobs.js";
import { githubFailure } from "../review/errors.js";
import { GitHubError, installationClient, type GhIssueRest, type IssuePatch } from "../review/github.js";
import { githubAs, githubIdentity } from "../review/github-user.js";
import { ageBucket, DAY, isStale, issueRefs, lastWeeks, median, statusOf, weekStart, type IssueStatus } from "../review/issues-logic.js";
import { issueRow, upsertIssue } from "../review/issues-sync.js";
import { protectedProcedure, router } from "../trpc.js";

/** Days without activity before an open issue counts as stale. */
export const STALE_DAYS = 14;

const ws = z.object({ workspaceId: z.string() });
const ref = z.object({ repo: z.string().min(1).max(200), number: z.number().int().positive() });

const filters = z.object({
  repoIds: z.array(z.number().int()).max(100).optional(),
  state: z.enum(["open", "closed", "all"]).default("open"),
  /** A login, "none" (unassigned) or "me". */
  assignee: z.string().max(60).optional(),
  /** A login or "me". */
  author: z.string().max(60).optional(),
  label: z.string().max(100).optional(),
  milestone: z.string().max(200).optional(),
  q: z.string().trim().max(100).optional(),
  stale: z.boolean().optional(),
  sort: z.enum(["updated", "created", "oldest", "comments"]).default("updated"),
});

type Filters = z.infer<typeof filters>;

async function scope(userId: string, workspaceId: string) {
  const member = await assertMember(userId, workspaceId);
  const repos = await visibleRepos(userId, workspaceId, member.repoIds);
  return { repos, byId: new Map(repos.map((r) => [r.id, r.fullName])) };
}

/** Make sure every visible repo has been mirrored once; the first visit queues the backfill. */
async function ensureSynced(repoIds: number[]) {
  if (!repoIds.length) return false;
  const never = await db
    .select({ id: schema.repository.id })
    .from(schema.repository)
    .where(and(inArray(schema.repository.id, repoIds), sql`${schema.repository.issuesSyncedAt} is null`));
  for (const r of never) await enqueue("sync_issues", { repoId: r.id });
  return never.length > 0;
}

function where(repoIds: number[], f: Filters, me: string | null): SQL | undefined {
  const c: (SQL | undefined)[] = [inArray(schema.issue.repoId, f.repoIds?.length ? f.repoIds.filter((id) => repoIds.includes(id)) : repoIds)];
  if (f.state !== "all") c.push(eq(schema.issue.state, f.state));
  if (f.assignee === "none") c.push(sql`cardinality(${schema.issue.assignees}) = 0`);
  else if (f.assignee) {
    const login = f.assignee === "me" ? me : f.assignee;
    c.push(login ? sql`${login} = ANY(${schema.issue.assignees})` : sql`false`);
  }
  if (f.author) {
    const login = f.author === "me" ? me : f.author;
    c.push(login ? sql`lower(${schema.issue.authorLogin}) = lower(${login})` : sql`false`);
  }
  if (f.label) c.push(sql`${schema.issue.labels} @> ${JSON.stringify([{ name: f.label }])}::jsonb`);
  if (f.milestone) c.push(eq(schema.issue.milestone, f.milestone));
  if (f.stale) c.push(and(eq(schema.issue.state, "open"), sql`${schema.issue.ghUpdatedAt} < now() - ${`${STALE_DAYS} days`}::interval`));
  if (f.q) {
    const n = f.q.match(/^#?(\d+)$/)?.[1];
    const like = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    c.push(n ? or(eq(schema.issue.number, Number(n)), sql`${schema.issue.title} ilike ${like}`) : sql`${schema.issue.title} ilike ${like}`);
  }
  return and(...c);
}

const ORDER = {
  updated: [desc(schema.issue.ghUpdatedAt)],
  created: [desc(schema.issue.ghCreatedAt)],
  oldest: [asc(schema.issue.ghCreatedAt)],
  comments: [desc(schema.issue.commentsCount), desc(schema.issue.ghUpdatedAt)],
} as const;

export interface LinkedPr {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  author: string;
  kind: "closes" | "mentions";
}

/** Pull requests (open, or merged in the last 60 days) that close or mention issues, keyed `repoId#number`. */
async function linkedPrs(repoIds: number[]): Promise<Map<string, LinkedPr[]>> {
  const out = new Map<string, LinkedPr[]>();
  if (!repoIds.length) return out;
  const prs = await db
    .select({
      repoId: schema.pullRequest.repoId,
      number: schema.pullRequest.number,
      title: schema.pullRequest.title,
      body: schema.pullRequest.body,
      headRef: schema.pullRequest.headRef,
      state: schema.pullRequest.state,
      draft: schema.pullRequest.draft,
      author: schema.pullRequest.authorLogin,
    })
    .from(schema.pullRequest)
    .where(
      and(
        inArray(schema.pullRequest.repoId, repoIds),
        or(eq(schema.pullRequest.state, "open"), and(eq(schema.pullRequest.state, "merged"), gte(schema.pullRequest.mergedAt, new Date(Date.now() - 60 * DAY)))),
      ),
    );
  for (const p of prs) {
    const { closes, mentions } = issueRefs(`${p.title}\n${p.body ?? ""}`);
    // Branch names like `fix/123-login` link too (the common "number in the branch" habit).
    const branch = p.headRef.match(/(?:^|[/-])(\d{1,6})(?:[-_/]|$)/)?.[1];
    const add = (n: number, kind: LinkedPr["kind"]) => {
      const key = `${p.repoId}#${n}`;
      const list = out.get(key) ?? [];
      if (!list.some((x) => x.number === p.number)) list.push({ number: p.number, title: p.title, state: p.state, draft: p.draft, author: p.author, kind });
      out.set(key, list);
    };
    for (const n of closes) add(n, "closes");
    for (const n of mentions) add(n, "mentions");
    if (branch && !closes.includes(Number(branch)) && !mentions.includes(Number(branch))) add(Number(branch), "mentions");
  }
  return out;
}

type Row = typeof schema.issue.$inferSelect;

function present(r: Row, repo: string, links: LinkedPr[], staleDays = STALE_DAYS) {
  return {
    repoId: r.repoId,
    repo,
    number: r.number,
    title: r.title,
    state: r.state,
    stateReason: r.stateReason,
    author: r.authorLogin,
    assignees: r.assignees,
    labels: r.labels,
    milestone: r.milestone,
    comments: r.commentsCount,
    createdAt: r.ghCreatedAt,
    updatedAt: r.ghUpdatedAt,
    closedAt: r.closedAt,
    stale: r.state === "open" && isStale(r.ghUpdatedAt, staleDays),
    status: statusOf(r, links) as IssueStatus,
    prs: links,
  };
}


async function installationOf(repoId: number) {
  const [r] = await db.select({ installationId: schema.repository.installationId }).from(schema.repository).where(eq(schema.repository.id, repoId));
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
  return r.installationId;
}

/** Edits go out as the person when their GitHub is linked (so GitHub attributes them), otherwise as the App. */
async function writerFor(userId: string, repoId: number) {
  return (await githubIdentity(userId)) ? githubAs(userId) : installationClient(await installationOf(repoId));
}

const myLogin = async (userId: string) => (await githubIdentity(userId))?.login ?? null;

const patchSchema = z.object({
  title: z.string().trim().min(1).max(256).optional(),
  body: z.string().max(65_000).optional(),
  state: z.enum(["open", "closed"]).optional(),
  stateReason: z.enum(["completed", "not_planned", "duplicate"]).optional(),
  labels: z.array(z.string().min(1).max(100)).max(30).optional(),
  assignees: z.array(z.string().regex(/^[A-Za-z0-9-]{1,39}$/)).max(10).optional(),
  /** GitHub milestone number, or null to clear. */
  milestone: z.number().int().nullable().optional(),
});

function toPatch(p: z.infer<typeof patchSchema>): IssuePatch {
  const patch: IssuePatch = {};
  if (p.title !== undefined) patch.title = p.title;
  if (p.body !== undefined) patch.body = p.body;
  if (p.labels) patch.labels = p.labels;
  if (p.assignees) patch.assignees = p.assignees;
  if (p.milestone !== undefined) patch.milestone = p.milestone;
  if (p.state) {
    patch.state = p.state;
    patch.state_reason = p.state === "open" ? "reopened" : (p.stateReason ?? "completed");
  }
  return patch;
}

export const issuesRouter = router({
  /** Filtered, sorted page of issues across the workspace's repos. */
  list: protectedProcedure
    .input(ws.extend({ filters: filters.default({ state: "open", sort: "updated" }), limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      const { repos, byId } = await scope(ctx.user.id, input.workspaceId);
      const syncing = await ensureSynced(repos.map((r) => r.id));
      const me = input.filters.assignee === "me" || input.filters.author === "me" ? await myLogin(ctx.user.id) : null;
      const cond = where(repos.map((r) => r.id), input.filters, me);
      const [rows, [{ total }], links] = await Promise.all([
        db.select().from(schema.issue).where(cond).orderBy(...ORDER[input.filters.sort]).limit(input.limit).offset(input.offset),
        db.select({ total: sql<number>`count(*)::int` }).from(schema.issue).where(cond) as Promise<{ total: number }[]>,
        linkedPrs(repos.map((r) => r.id)),
      ]);
      return {
        syncing,
        total,
        items: rows.map((r) => present(r, byId.get(r.repoId) ?? "", links.get(`${r.repoId}#${r.number}`) ?? [])),
        repos,
      };
    }),

  /** Numbers for the view tabs. */
  counts: protectedProcedure.input(ws).query(async ({ ctx, input }) => {
    const { repos } = await scope(ctx.user.id, input.workspaceId);
    const ids = repos.map((r) => r.id);
    const me = await myLogin(ctx.user.id);
    if (!ids.length) return { open: 0, triage: 0, mine: 0, created: 0, stale: 0 };
    const [c] = await db
      .select({
        open: sql<number>`count(*)::int`,
        triage: sql<number>`(count(*) filter (where cardinality(${schema.issue.assignees}) = 0))::int`,
        mine: sql<number>`(count(*) filter (where ${me}::text is not null and ${me}::text = any(${schema.issue.assignees})))::int`,
        created: sql<number>`(count(*) filter (where ${me}::text is not null and lower(${schema.issue.authorLogin}) = lower(${me}::text)))::int`,
        stale: sql<number>`(count(*) filter (where ${schema.issue.ghUpdatedAt} < now() - ${`${STALE_DAYS} days`}::interval))::int`,
      })
      .from(schema.issue)
      .where(and(inArray(schema.issue.repoId, ids), eq(schema.issue.state, "open")));
    return c!;
  }),

  /** Distinct labels, milestones and assignees on open issues, for the filter menus. */
  facets: protectedProcedure.input(ws).query(async ({ ctx, input }) => {
    const { repos } = await scope(ctx.user.id, input.workspaceId);
    const ids = repos.map((r) => r.id);
    if (!ids.length) return { labels: [] as string[], milestones: [] as string[], assignees: [] as string[] };
    const rows = await db
      .select({ labels: schema.issue.labels, milestone: schema.issue.milestone, assignees: schema.issue.assignees })
      .from(schema.issue)
      .where(and(inArray(schema.issue.repoId, ids), eq(schema.issue.state, "open")))
      .limit(3000);
    const labels = new Set<string>(), milestones = new Set<string>(), assignees = new Set<string>();
    for (const r of rows) {
      for (const l of r.labels) labels.add(l.name);
      if (r.milestone) milestones.add(r.milestone);
      for (const a of r.assignees) assignees.add(a);
    }
    const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
    return { labels: sorted(labels), milestones: sorted(milestones), assignees: sorted(assignees) };
  }),

  /** Open issues plus anything closed in the last two weeks, grouped by derived status. */
  board: protectedProcedure.input(ws.extend({ repoIds: z.array(z.number().int()).max(100).optional() })).query(async ({ ctx, input }) => {
    const { repos, byId } = await scope(ctx.user.id, input.workspaceId);
    const ids = repos.map((r) => r.id).filter((id) => !input.repoIds?.length || input.repoIds.includes(id));
    if (!ids.length) return { columns: { todo: [], in_progress: [], in_review: [], done: [] } as Record<IssueStatus, ReturnType<typeof present>[]> };
    const [rows, links] = await Promise.all([
      db
        .select()
        .from(schema.issue)
        .where(and(inArray(schema.issue.repoId, ids), or(eq(schema.issue.state, "open"), gte(schema.issue.closedAt, new Date(Date.now() - 14 * DAY)))))
        .orderBy(desc(schema.issue.ghUpdatedAt))
        .limit(400),
      linkedPrs(ids),
    ]);
    const columns: Record<IssueStatus, ReturnType<typeof present>[]> = { todo: [], in_progress: [], in_review: [], done: [] };
    for (const r of rows) {
      const p = present(r, byId.get(r.repoId) ?? "", links.get(`${r.repoId}#${r.number}`) ?? []);
      columns[p.status].push(p);
    }
    return { columns };
  }),

  /** One issue with its live body and comments, linked PRs, and what the person may do. Falls back to our copy when GitHub is unreachable. */
  get: protectedProcedure.input(ref).query(async ({ ctx, input }) => {
    const repo = await repoForUser(ctx.user.id, input.repo);
    const links = (await linkedPrs([repo.id])).get(`${repo.id}#${input.number}`) ?? [];
    const base = { canEdit: repo.role !== "viewer", offline: false };
    const gh = installationClient(await installationOf(repo.id));
    try {
      const live: GhIssueRest = await gh.getIssueRest(repo.fullName, input.number);
      if (live.pull_request) throw new TRPCError({ code: "NOT_FOUND", message: "That's a pull request, not an issue." });
      await upsertIssue(repo.id, live);
      const comments = live.comments ? await gh.issueComments(repo.fullName, input.number) : [];
      const row = { ...issueRow(repo.id, live), createdAt: new Date(), updatedAt: new Date() } as Row;
      return {
        ...present(row, repo.fullName, links),
        ...base,
        body: live.body ?? "",
        url: live.html_url,
        comments: comments.map((c) => ({ id: c.id, author: c.user?.login ?? "ghost", body: c.body, createdAt: c.created_at, association: c.author_association ?? null })),
      };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      if (err instanceof GitHubError && (err.status === 404 || err.status === 410)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That issue doesn't exist (or was deleted)." });
      }
      // GitHub is down, rate limited, or not configured: show what we have mirrored.
      console.error(`[issues] live fetch of ${repo.fullName}#${input.number} failed: ${(err as Error).message}`);
      const [row] = await db.select().from(schema.issue).where(and(eq(schema.issue.repoId, repo.id), eq(schema.issue.number, input.number)));
      if (!row) return githubFailure(err);
      return {
        ...present(row, repo.fullName, links),
        ...base,
        offline: true,
        body: row.body ?? "",
        url: `https://github.com/${repo.fullName}/issues/${input.number}`,
        comments: [] as { id: number; author: string; body: string; createdAt: string; association: string | null }[],
      };
    }
  }),

  /** Labels, assignable people and open milestones for one repo (pickers). */
  repoMeta: protectedProcedure.input(z.object({ repo: z.string().min(1).max(200) })).query(async ({ ctx, input }) => {
    const repo = await repoForUser(ctx.user.id, input.repo);
    const gh = installationClient(await installationOf(repo.id));
    try {
      const [labels, assignees, milestones] = await Promise.all([
        cached(`labels:${repo.id}`, 5 * 60_000, () => gh.listLabels(repo.fullName)),
        cached(`assignees:${repo.id}`, 5 * 60_000, () => gh.listAssignees(repo.fullName)),
        cached(`milestones:${repo.id}`, 5 * 60_000, () => gh.listMilestones(repo.fullName)),
      ]);
      return { labels, assignees, milestones };
    } catch (err) {
      return githubFailure(err);
    }
  }),

  update: protectedProcedure.input(ref.extend({ patch: patchSchema, duplicateOf: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
    const repo = await repoForAction(ctx.user.id, input.repo, "review.act");
    try {
      const writer = await writerFor(ctx.user.id, repo.id);
      const updated = await writer.patchIssue(repo.fullName, input.number, toPatch(input.patch));
      await upsertIssue(repo.id, updated);
      if (input.duplicateOf && input.patch.stateReason === "duplicate") {
        await writer.addIssueComment(repo.fullName, input.number, `Duplicate of #${input.duplicateOf}`).catch(() => {});
      }
      await audit(repo.workspaceId, ctx.user.id, "issue.update", `${repo.fullName}#${input.number}`, { fields: Object.keys(input.patch) });
      return { ok: true };
    } catch (err) {
      return githubFailure(err);
    }
  }),

  comment: protectedProcedure.input(ref.extend({ body: z.string().trim().min(1).max(65_000) })).mutation(async ({ ctx, input }) => {
    const repo = await repoForAction(ctx.user.id, input.repo, "review.act");
    try {
      const writer = await writerFor(ctx.user.id, repo.id);
      const c = await writer.addIssueComment(repo.fullName, input.number, input.body);
      await db
        .update(schema.issue)
        .set({ commentsCount: sql`${schema.issue.commentsCount} + 1`, ghUpdatedAt: new Date() })
        .where(and(eq(schema.issue.repoId, repo.id), eq(schema.issue.number, input.number)));
      return { id: c.id };
    } catch (err) {
      return githubFailure(err);
    }
  }),

  /** One action over up to 50 issues; each item succeeds or fails on its own. */
  bulk: protectedProcedure
    .input(
      z.object({
        items: z.array(ref).min(1).max(50),
        action: z.discriminatedUnion("type", [
          z.object({ type: z.literal("close"), reason: z.enum(["completed", "not_planned"]).default("completed") }),
          z.object({ type: z.literal("reopen") }),
          z.object({ type: z.literal("label"), label: z.string().min(1).max(100) }),
          z.object({ type: z.literal("assign"), login: z.string().regex(/^[A-Za-z0-9-]{1,39}$/) }),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const results: { repo: string; number: number; ok: boolean; error?: string }[] = [];
      const repos = new Map<string, Awaited<ReturnType<typeof repoForAction>>>();
      for (const item of input.items) {
        try {
          let repo = repos.get(item.repo);
          if (!repo) repos.set(item.repo, (repo = await repoForAction(ctx.user.id, item.repo, "review.act")));
          const [row] = await db.select().from(schema.issue).where(and(eq(schema.issue.repoId, repo.id), eq(schema.issue.number, item.number)));
          if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
          const a = input.action;
          const patch: IssuePatch =
            a.type === "close"
              ? { state: "closed", state_reason: a.reason }
              : a.type === "reopen"
                ? { state: "open", state_reason: "reopened" }
                : a.type === "label"
                  ? { labels: [...new Set([...row.labels.map((l) => l.name), a.label])] }
                  : { assignees: [...new Set([...row.assignees, a.login])] };
          const updated = await (await writerFor(ctx.user.id, repo.id)).patchIssue(repo.fullName, item.number, patch);
          await upsertIssue(repo.id, updated);
          results.push({ ...item, ok: true });
        } catch (err) {
          let error = "Failed";
          try {
            githubFailure(err);
          } catch (e) {
            error = (e as Error).message;
          }
          results.push({ ...item, ok: false, error });
        }
      }
      const first = [...repos.values()][0];
      if (first) await audit(first.workspaceId, ctx.user.id, "issue.bulk", `${results.filter((r) => r.ok).length}/${results.length}`, { action: input.action.type });
      return { results };
    }),

  /** Flow and backlog health, computed from the mirror. */
  insights: protectedProcedure.input(ws).query(async ({ ctx, input }) => {
    const { repos, byId } = await scope(ctx.user.id, input.workspaceId);
    const ids = repos.map((r) => r.id);
    const empty = {
      open: 0, unassigned: 0, stale: 0, medianDaysToClose: null as number | null, closedLast30: 0, openedLast30: 0,
      weeks: [] as { week: string; opened: number; closed: number }[],
      aging: { week: 0, month: 0, quarter: 0, older: 0 },
      byRepo: [] as { repo: string; open: number }[],
      byPerson: [] as { login: string; open: number }[],
    };
    if (!ids.length) return empty;
    const since = new Date(Date.now() - 84 * DAY);
    const rows = await db
      .select({
        repoId: schema.issue.repoId,
        state: schema.issue.state,
        assignees: schema.issue.assignees,
        createdAt: schema.issue.ghCreatedAt,
        updatedAt: schema.issue.ghUpdatedAt,
        closedAt: schema.issue.closedAt,
      })
      .from(schema.issue)
      .where(and(inArray(schema.issue.repoId, ids), or(eq(schema.issue.state, "open"), gte(schema.issue.closedAt, since), gte(schema.issue.ghCreatedAt, since))));

    const weeks = new Map(lastWeeks(12).map((w) => [w, { week: w, opened: 0, closed: 0 }]));
    const aging = { week: 0, month: 0, quarter: 0, older: 0 };
    const repoOpen = new Map<number, number>();
    const person = new Map<string, number>();
    const durations: number[] = [];
    const t30 = Date.now() - 30 * DAY;
    let open = 0, unassigned = 0, stale = 0, closedLast30 = 0, openedLast30 = 0;
    for (const r of rows) {
      const created = weeks.get(weekStart(r.createdAt));
      if (created) created.opened++;
      if (r.createdAt.getTime() >= t30) openedLast30++;
      if (r.closedAt) {
        const w = weeks.get(weekStart(r.closedAt));
        if (w) w.closed++;
        if (r.closedAt.getTime() >= t30) {
          closedLast30++;
          durations.push((r.closedAt.getTime() - r.createdAt.getTime()) / DAY);
        }
      }
      if (r.state !== "open") continue;
      open++;
      if (!r.assignees.length) unassigned++;
      if (isStale(r.updatedAt, STALE_DAYS)) stale++;
      aging[ageBucket(r.createdAt)]++;
      repoOpen.set(r.repoId, (repoOpen.get(r.repoId) ?? 0) + 1);
      for (const a of r.assignees) person.set(a, (person.get(a) ?? 0) + 1);
    }
    const m = median(durations);
    return {
      open, unassigned, stale, closedLast30, openedLast30,
      medianDaysToClose: m === null ? null : Math.round(m * 10) / 10,
      weeks: [...weeks.values()],
      aging,
      byRepo: [...repoOpen].map(([id, n]) => ({ repo: byId.get(id) ?? String(id), open: n })).sort((a, b) => b.open - a.open),
      byPerson: [...person].map(([login, n]) => ({ login, open: n })).sort((a, b) => b.open - a.open).slice(0, 12),
    };
  }),
});
