import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { audit, repoForAction } from "../access.js";
import { track } from "../analytics.js";
import { githubFailure } from "../review/errors.js";
import { GitHubError, getInstallation, installationClient } from "../review/github.js";
import { githubAs, githubIdentity } from "../review/github-user.js";
import {
  branchName,
  cleanTitle,
  extractTraceRefs,
  fuzzyScore,
  indexTree,
  keywords,
  MAX_BODY,
  MAX_TITLE,
  parseMdTemplate,
  permalink,
  resolvePath,
  unapplied,
  type CodeRef,
  type MdTemplate,
} from "../review/issue.js";
import { codeownerLogins, rankReviewers, reviewCandidates } from "../review/reviewers.js";
import { protectedProcedure, router } from "../trpc.js";

const repoIn = z.object({ repo: z.string().min(1).max(200) });

// ponytail: in-memory per process (like the blame cache); move to Postgres/Redis with more than one instance.
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Sliding-window limiter per user and bucket. */
const hits = new Map<string, number[]>();
function limit(userId: string, bucket: string, max: number, windowMs: number, message: string) {
  const key = `${bucket}:${userId}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
  recent.push(now);
  hits.set(key, recent);
}

const MIN = 60_000;

interface RepoRow {
  id: number;
  fullName: string;
  workspaceId: string;
}

async function installationOf(repoId: number) {
  const [r] = await db
    .select({ installationId: schema.repository.installationId })
    .from(schema.repository)
    .where(eq(schema.repository.id, repoId));
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
  return r.installationId;
}

async function metaOf(repo: RepoRow, installationId: number) {
  return cached(`meta:${repo.id}`, 5 * MIN, () => installationClient(installationId).repoMeta(repo.fullName));
}

/** File index of the default branch's latest commit, cached per commit. */
async function treeOf(repo: RepoRow, installationId: number) {
  const meta = await metaOf(repo, installationId);
  return cached(`tree:${repo.id}@${meta.headSha}`, 30 * MIN, async () => {
    const t = await installationClient(installationId).tree(repo.fullName, meta.headSha);
    return { index: indexTree(t.paths), paths: t.paths, truncated: t.truncated, sha: meta.headSha };
  });
}

/** Top-level folders (and apps/*, packages/* children in monorepos) as pickable areas. */
function areasOf(paths: string[]) {
  const dirs = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    if (parts.length < 2) continue;
    dirs.add(parts[0]!);
    if (["apps", "packages", "services", "libs"].includes(parts[0]!) && parts.length > 2) dirs.add(`${parts[0]}/${parts[1]}`);
  }
  return [...dirs].filter((d) => !d.startsWith(".")).sort().slice(0, 60);
}

/** What GitHub says when the App has no Issues permission (or the installation hasn't accepted it yet). */
const NO_ISSUES_PERMISSION = "Issues aren't enabled for this GitHub installation. An admin needs to accept the GitHub App's new Issues permission.";

function createFailure(err: unknown): never {
  if (err instanceof GitHubError) {
    if (err.status === 403 && /not accessible by integration/i.test(err.message)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NO_ISSUES_PERMISSION });
    }
    if (err.status === 403 || err.status === 429) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "GitHub asked us to slow down. Try again in a minute." });
    }
    if (err.status === 410) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Issues are turned off for this repository." });
    if (err.status === 404) throw new TRPCError({ code: "FORBIDDEN", message: "You don't have access to create issues in this repository." });
  }
  return githubFailure(err);
}

export const issueRouter = router({
  /** Everything the panel needs to open: repo flags, labels, repo templates, areas, who can be assigned. */
  options: protectedProcedure.input(repoIn).query(async ({ ctx, input }) => {
    const repo = await repoForAction(ctx.user.id, input.repo, "review.act");
    const installationId = await installationOf(repo.id);
    const gh = installationClient(installationId);
    try {
      const [meta, tree, labels, assignees, templates, permissions, identity] = await Promise.all([
        metaOf(repo, installationId),
        treeOf(repo, installationId),
        cached(`labels:${repo.id}`, 5 * MIN, () => gh.listLabels(repo.fullName)),
        cached(`assignees:${repo.id}`, 5 * MIN, () => gh.listAssignees(repo.fullName)),
        cached(`templates:${repo.id}`, 5 * MIN, async () => {
          const files = await gh.issueTemplateFiles(repo.fullName);
          const md = files.filter((f) => /\.md$/i.test(f)).slice(0, 6);
          const loaded = await Promise.all(
            md.map(async (f) => {
              const text = await gh.fileContent(repo.fullName, `.github/ISSUE_TEMPLATE/${f}`).catch(() => null);
              return text === null ? null : parseMdTemplate(f, text);
            }),
          );
          let list = loaded.filter((t): t is MdTemplate => t !== null);
          if (!files.length) {
            for (const p of [".github/ISSUE_TEMPLATE.md", "ISSUE_TEMPLATE.md"]) {
              const text = await gh.fileContent(repo.fullName, p).catch(() => null);
              if (text !== null) {
                list = [parseMdTemplate("issue_template.md", text)];
                break;
              }
            }
          }
          return { list, usesForms: files.some((f) => /\.ya?ml$/i.test(f) && !/^config\.ya?ml$/i.test(f)) };
        }),
        cached(`perm:${installationId}`, 10 * MIN, async () => (await getInstallation(installationId)).permissions ?? {}),
        githubIdentity(ctx.user.id),
      ]);
      return {
        hasIssues: meta.hasIssues,
        archived: meta.archived,
        defaultBranch: meta.defaultBranch,
        issuesPermission: permissions.issues === "write",
        githubConnected: Boolean(identity),
        labels,
        templates: templates.list,
        usesForms: templates.usesForms,
        areas: areasOf(tree.paths),
        assignableCount: assignees.length,
      };
    } catch (err) {
      return githubFailure(err);
    }
  }),

  /** Open issues with similar titles. Never blocks creation; quietly empty when GitHub's search limit is hit. */
  similar: protectedProcedure.input(repoIn.extend({ title: z.string().max(MAX_TITLE * 2) })).query(async ({ ctx, input }) => {
    const repo = await repoForAction(ctx.user.id, input.repo, "review.act");
    const terms = keywords(input.title);
    if (!terms.length) return { items: [], unavailable: false };
    limit(ctx.user.id, "similar", 20, MIN, "Slow down a little");
    const installationId = await installationOf(repo.id);
    try {
      const items = await cached(`similar:${repo.id}:${terms.join(" ")}`, MIN, () =>
        installationClient(installationId).searchIssues(repo.fullName, terms),
      );
      return { items, unavailable: false };
    } catch (err) {
      if (err instanceof GitHubError) return { items: [], unavailable: true };
      return githubFailure(err);
    }
  }),

  /** File:line references in pasted text (stack traces), checked against the repo and turned into permalinks. */
  references: protectedProcedure.input(repoIn.extend({ text: z.string().max(100_000) })).query(async ({ ctx, input }) => {
    const repo = await repoForAction(ctx.user.id, input.repo, "review.act");
    const raw = extractTraceRefs(input.text);
    if (!raw.length) return { refs: [] as CodeRef[], skipped: 0 };
    const installationId = await installationOf(repo.id);
    try {
      const tree = await treeOf(repo, installationId);
      const gh = installationClient(installationId);
      const refs: CodeRef[] = [];
      for (const r of raw) {
        let path = resolvePath(r.path, tree.index);
        // Huge repos: GitHub cut the listing, so confirm plain repo-relative paths one by one.
        if (!path && tree.truncated && !r.path.startsWith("/") && refs.length < 10) {
          path = await gh.fileContent(repo.fullName, r.path, tree.sha).then(() => r.path).catch(() => null);
        }
        if (path && !refs.some((x) => x.path === path && x.line === r.line)) {
          refs.push({ path, line: r.line, url: permalink(repo.fullName, tree.sha, path, r.line) });
        }
        if (refs.length >= 10) break;
      }
      return { refs, skipped: raw.length - refs.length };
    } catch (err) {
      return githubFailure(err);
    }
  }),

  /** Fuzzy file search over the default branch, for "Reference code". */
  searchFiles: protectedProcedure.input(repoIn.extend({ q: z.string().max(200) })).query(async ({ ctx, input }) => {
    const repo = await repoForAction(ctx.user.id, input.repo, "review.act");
    const installationId = await installationOf(repo.id);
    try {
      const tree = await treeOf(repo, installationId);
      const scored: { path: string; score: number }[] = [];
      for (const path of tree.paths) {
        const score = fuzzyScore(input.q, path);
        if (score !== null) scored.push({ path, score });
      }
      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((s) => ({ path: s.path, url: permalink(repo.fullName, tree.sha, s.path, 0) }));
    } catch (err) {
      return githubFailure(err);
    }
  }),

  /** Who could take this: assignable on GitHub, ranked by CODEOWNERS, expertise tags and load. Away people are left out. */
  suggestAssignees: protectedProcedure.input(repoIn.extend({ paths: z.array(z.string().max(500)).max(30) })).query(async ({ ctx, input }) => {
    const repo = await repoForAction(ctx.user.id, input.repo, "review.act");
    const installationId = await installationOf(repo.id);
    const gh = installationClient(installationId);
    try {
      const [candidates, assignable] = await Promise.all([
        reviewCandidates(repo.id, repo.workspaceId),
        cached(`assignees:${repo.id}`, 5 * MIN, () => gh.listAssignees(repo.fullName)),
      ]);
      const ok = new Set(assignable.map((l) => l.toLowerCase()));
      const owners = await codeownerLogins({ id: repo.id, fullName: repo.fullName, installationId }, input.paths);
      return rankReviewers(
        candidates.filter((c) => ok.has(c.login.toLowerCase())),
        { author: "", paths: input.paths, codeowners: owners, folderReviews: new Map() },
      )
        .slice(0, 6)
        .map((s) => ({ login: s.login, name: s.name, reasons: s.reasons }));
    } catch (err) {
      return githubFailure(err);
    }
  }),

  create: protectedProcedure
    .input(
      repoIn.extend({
        title: z.string().min(1).max(MAX_TITLE * 2),
        body: z.string().max(MAX_BODY),
        type: z.enum(["bug", "feature", "task"]),
        labels: z.array(z.string().min(1).max(100)).max(10).default([]),
        assignees: z.array(z.string().regex(/^[A-Za-z0-9-]{1,39}$/)).max(5).default([]),
        clientKey: z.string().min(8).max(64),
        source: z.enum(["board", "palette", "shortcut", "link"]).default("board"),
        hadTrace: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const repo = await repoForAction(ctx.user.id, input.repo, "review.act");
      const title = cleanTitle(input.title);
      if (!title) throw new TRPCError({ code: "BAD_REQUEST", message: "Add a title" });

      // Claim the key first: a double click or retry can't create a second issue.
      const id = randomUUID();
      const claimed = await db
        .insert(schema.issueCreation)
        .values({ id, userId: ctx.user.id, repoId: repo.id, clientKey: input.clientKey, number: 0, url: "" })
        .onConflictDoNothing()
        .returning({ id: schema.issueCreation.id });
      if (!claimed.length) {
        const [prior] = await db
          .select()
          .from(schema.issueCreation)
          .where(and(eq(schema.issueCreation.userId, ctx.user.id), eq(schema.issueCreation.clientKey, input.clientKey)));
        if (prior && prior.number > 0) {
          return { number: prior.number, url: prior.url, branch: branchName(input.type, prior.number, title), dropped: { labels: [], assignees: [] }, replayed: true };
        }
        throw new TRPCError({ code: "CONFLICT", message: "This issue is already being created" });
      }

      try {
        limit(ctx.user.id, "create", 10, MIN, "You're creating issues quickly. Try again in a minute.");
        const created = await githubAs(ctx.user.id)
          .createIssue(repo.fullName, { title, body: input.body, labels: input.labels, assignees: input.assignees })
          .catch(createFailure);
        const dropped = unapplied(
          { labels: input.labels, assignees: input.assignees },
          {
            labels: created.labels.map((l) => (typeof l === "string" ? l : l.name)),
            assignees: (created.assignees ?? []).map((a) => a.login),
          },
        );
        await db
          .update(schema.issueCreation)
          .set({ number: created.number, url: created.html_url })
          .where(eq(schema.issueCreation.id, id));
        await audit(repo.workspaceId, ctx.user.id, "issue.create", `${repo.fullName}#${created.number}`, { type: input.type });
        await track(ctx.user.id, repo.workspaceId, "issue_created", { source: input.source, type: input.type, hadTrace: input.hadTrace, labels: input.labels.length, assignees: input.assignees.length });
        return { number: created.number, url: created.html_url, branch: branchName(input.type, created.number, title), dropped, replayed: false };
      } catch (err) {
        // Nothing was created: free the key so the user can retry.
        await db.delete(schema.issueCreation).where(and(eq(schema.issueCreation.id, id), eq(schema.issueCreation.number, 0)));
        throw err;
      }
    }),
});

