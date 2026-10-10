import { enqueue } from "../jobs.js";
import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { cached } from "../cache.js";
import { assertMember, audit, repoForAction, repoForUser } from "../access.js";
import { decrypt } from "../crypto.js";
import { createLinearIssue } from "../linear.js";
import { teamLogins } from "../review/apply-rules.js";
import { parseIssueForm } from "../review/issue-form.js";
import { issueRules } from "../review/rules.js";
import { track } from "../analytics.js";
import { githubFailure } from "../review/errors.js";
import {
  GitHubError,
  getInstallation,
  installationClient,
} from "../review/github.js";
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
  type FormTemplate,
  type MdTemplate,
} from "../review/issue.js";
import {
  codeownerLogins,
  rankReviewers,
  reviewCandidates,
} from "../review/reviewers.js";
import { protectedProcedure, router } from "../trpc.js";

const repoIn = z.object({ repo: z.string().min(1).max(200) });

/** Sliding-window limiter per user and bucket. */
const hits = new Map<string, number[]>();
function limit(
  userId: string,
  bucket: string,
  max: number,
  windowMs: number,
  message: string,
) {
  const key = `${bucket}:${userId}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max)
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
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
  if (!r)
    throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
  return r.installationId;
}

async function metaOf(repo: RepoRow, installationId: number) {
  return cached(`meta:${repo.id}`, 5 * MIN, () =>
    installationClient(installationId).repoMeta(repo.fullName),
  );
}

/** File index of the default branch's latest commit, cached per commit. */
async function treeOf(repo: RepoRow, installationId: number) {
  const meta = await metaOf(repo, installationId);
  return cached(
    `tree:${repo.id}@${meta.headSha}`,
    30 * MIN,
    async () => {
      const t = await installationClient(installationId).tree(
        repo.fullName,
        meta.headSha,
      );
      return {
        index: indexTree(t.paths),
        paths: t.paths,
        truncated: t.truncated,
        sha: meta.headSha,
      };
    },
    { local: true },
  ); // the index isn't JSON-safe, so it stays per instance
}

/** Top-level folders (and apps/*, packages/* children in monorepos) as pickable areas. */
function areasOf(paths: string[]) {
  const dirs = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    if (parts.length < 2) continue;
    dirs.add(parts[0]!);
    if (
      ["apps", "packages", "services", "libs"].includes(parts[0]!) &&
      parts.length > 2
    )
      dirs.add(`${parts[0]}/${parts[1]}`);
  }
  return [...dirs]
    .filter((d) => !d.startsWith("."))
    .sort()
    .slice(0, 60);
}

/** Routing rules that apply to these paths: labels to add and people to suggest (path rules only). */
async function ruleHits(repo: RepoRow, paths: string[]) {
  const [row] = await db
    .select({ rules: schema.repository.routingRules })
    .from(schema.repository)
    .where(eq(schema.repository.id, repo.id));
  const hits = issueRules(row?.rules ?? [], paths);
  const labels = [...new Set(hits.flatMap((r) => (r.label ? [r.label] : [])))];
  const logins = new Set(hits.flatMap((r) => r.reviewers));
  for (const r of hits)
    if (r.teamId)
      for (const l of await teamLogins(r.teamId, repo.workspaceId))
        logins.add(l);
  return { labels, logins: [...logins] };
}

/** What GitHub says when the App has no Issues permission (or the installation hasn't accepted it yet). */
const NO_ISSUES_PERMISSION =
  "Issues aren't enabled for this GitHub installation. An admin needs to accept the GitHub App's new Issues permission.";

function createFailure(err: unknown): never {
  if (err instanceof GitHubError) {
    if (
      err.status === 403 &&
      /not accessible by integration/i.test(err.message)
    ) {
      throw new TRPCError({ code: "FORBIDDEN", message: NO_ISSUES_PERMISSION });
    }
    if (err.status === 403 || err.status === 429) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "GitHub asked us to slow down. Try again in a minute.",
      });
    }
    if (err.status === 410)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Issues are turned off for this repository.",
      });
    if (err.status === 404)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You don't have access to create issues in this repository.",
      });
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
      const [linear] = await db
        .select({
          teamName: schema.linearIntegration.defaultTeamName,
          teamId: schema.linearIntegration.defaultTeamId,
        })
        .from(schema.linearIntegration)
        .where(eq(schema.linearIntegration.workspaceId, repo.workspaceId));
      const [meta, tree, labels, assignees, templates, permissions, identity] =
        await Promise.all([
          metaOf(repo, installationId),
          treeOf(repo, installationId),
          cached(`labels:${repo.id}`, 5 * MIN, () =>
            gh.listLabels(repo.fullName),
          ),
          cached(`assignees:${repo.id}`, 5 * MIN, () =>
            gh.listAssignees(repo.fullName),
          ),
          cached(`templates:${repo.id}`, 5 * MIN, async () => {
            const files = await gh.issueTemplateFiles(repo.fullName);
            const md = files.filter((f) => /\.md$/i.test(f)).slice(0, 6);
            const yml = files
              .filter((f) => /\.ya?ml$/i.test(f) && !/^config\.ya?ml$/i.test(f))
              .slice(0, 6);
            const read = (f: string) =>
              gh
                .fileContent(repo.fullName, `.github/ISSUE_TEMPLATE/${f}`)
                .catch(() => null);
            const forms = (
              await Promise.all(
                yml.map(async (f) => {
                  const t = await read(f);
                  return t === null ? null : parseIssueForm(f, t);
                }),
              )
            ).filter((f): f is FormTemplate => f !== null);
            const loaded = await Promise.all(
              md.map(async (f) => {
                const t = await read(f);
                return t === null ? null : parseMdTemplate(f, t);
              }),
            );
            let list = loaded.filter((t): t is MdTemplate => t !== null);
            if (!files.length) {
              for (const p of [
                ".github/ISSUE_TEMPLATE.md",
                "ISSUE_TEMPLATE.md",
              ]) {
                const text = await gh
                  .fileContent(repo.fullName, p)
                  .catch(() => null);
                if (text !== null) {
                  list = [parseMdTemplate("issue_template.md", text)];
                  break;
                }
              }
            }
            return {
              list,
              forms,
              usesForms: yml.length > 0 && forms.length === 0,
            };
          }),
          cached(
            `perm:${installationId}`,
            10 * MIN,
            async () =>
              (await getInstallation(installationId)).permissions ?? {},
          ),
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
        forms: templates.forms,
        usesForms: templates.usesForms,
        linear: linear?.teamId
          ? { teamName: linear.teamName ?? "Linear" }
          : null,
        areas: areasOf(tree.paths),
        assignableCount: assignees.length,
      };
    } catch (err) {
      return githubFailure(err);
    }
  }),

  /** Open issues with similar titles. Never blocks creation; quietly empty when GitHub's search limit is hit. */
  similar: protectedProcedure
    .input(repoIn.extend({ title: z.string().max(MAX_TITLE * 2) }))
    .query(async ({ ctx, input }) => {
      const repo = await repoForAction(ctx.user.id, input.repo, "review.act");
      const terms = keywords(input.title);
      if (!terms.length) return { items: [], unavailable: false };
      limit(ctx.user.id, "similar", 20, MIN, "Slow down a little");
      const installationId = await installationOf(repo.id);
      try {
        const items = await cached(
          `similar:${repo.id}:${terms.join(" ")}`,
          MIN,
          () =>
            installationClient(installationId).searchIssues(
              repo.fullName,
              terms,
            ),
        );
        return { items, unavailable: false };
      } catch (err) {
        if (err instanceof GitHubError) return { items: [], unavailable: true };
        return githubFailure(err);
      }
    }),

  /** File:line references in pasted text (stack traces), checked against the repo and turned into permalinks. */
  references: protectedProcedure
    .input(repoIn.extend({ text: z.string().max(100_000) }))
    .query(async ({ ctx, input }) => {
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
          if (
            !path &&
            tree.truncated &&
            !r.path.startsWith("/") &&
            refs.length < 10
          ) {
            path = await gh
              .fileContent(repo.fullName, r.path, tree.sha)
              .then(() => r.path)
              .catch(() => null);
          }
          if (path && !refs.some((x) => x.path === path && x.line === r.line)) {
            refs.push({
              path,
              line: r.line,
              url: permalink(repo.fullName, tree.sha, path, r.line),
            });
          }
          if (refs.length >= 10) break;
        }
        return { refs, skipped: raw.length - refs.length };
      } catch (err) {
        return githubFailure(err);
      }
    }),

  /** Fuzzy file search over the default branch, for "Reference code". */
  searchFiles: protectedProcedure
    .input(repoIn.extend({ q: z.string().max(200) }))
    .query(async ({ ctx, input }) => {
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
          .map((s) => ({
            path: s.path,
            url: permalink(repo.fullName, tree.sha, s.path, 0),
          }));
      } catch (err) {
        return githubFailure(err);
      }
    }),

  /** Labels routing rules want on an issue touching these paths. */
  ruleLabels: protectedProcedure
    .input(repoIn.extend({ paths: z.array(z.string().max(500)).max(30) }))
    .query(async ({ ctx, input }) => {
      const repo = await repoForAction(ctx.user.id, input.repo, "review.act");
      return (await ruleHits(repo, input.paths)).labels;
    }),

  /** Open issues matching a search, across the repos this person can see (⌘K). */
  search: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        q: z.string().trim().min(3).max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const member = await assertMember(ctx.user.id, input.workspaceId);
      limit(ctx.user.id, "search", 30, MIN, "Slow down a little");
      const [repos, visible] = await Promise.all([
        db
          .select({
            id: schema.repository.id,
            fullName: schema.repository.fullName,
            installationId: schema.repository.installationId,
          })
          .from(schema.repository)
          .innerJoin(
            schema.githubInstallation,
            eq(schema.githubInstallation.id, schema.repository.installationId),
          )
          .where(
            and(
              eq(schema.githubInstallation.workspaceId, input.workspaceId),
              eq(schema.repository.enabled, true),
            ),
          ),
        db
          .select({ repoId: schema.githubRepoAccess.repoId })
          .from(schema.githubRepoAccess)
          .where(eq(schema.githubRepoAccess.userId, ctx.user.id)),
      ]);
      const seen = new Set(visible.map((v) => v.repoId));
      const mine = repos
        .filter(
          (r) =>
            seen.has(r.id) &&
            (!member.repoIds || member.repoIds.includes(r.id)),
        )
        .slice(0, 8);
      if (!mine.length) return [];
      // One search per installation (each has its own token); at most two.
      const groups = new Map<number, string[]>();
      for (const r of mine)
        groups.set(r.installationId, [
          ...(groups.get(r.installationId) ?? []),
          r.fullName,
        ]);
      try {
        const found = await Promise.all(
          [...groups]
            .slice(0, 2)
            .map(([installationId, names]) =>
              cached(
                `isearch:${installationId}:${names.join(",")}:${input.q.toLowerCase()}`,
                MIN,
                () =>
                  installationClient(installationId).searchIssuesIn(
                    names,
                    input.q,
                  ),
              ),
            ),
        );
        return found.flat().slice(0, 8);
      } catch (err) {
        if (err instanceof GitHubError) return [];
        return githubFailure(err);
      }
    }),

  /** Who could take this: assignable on GitHub, ranked by CODEOWNERS, expertise tags and load. Away people are left out. */
  suggestAssignees: protectedProcedure
    .input(repoIn.extend({ paths: z.array(z.string().max(500)).max(30) }))
    .query(async ({ ctx, input }) => {
      const repo = await repoForAction(ctx.user.id, input.repo, "review.act");
      const installationId = await installationOf(repo.id);
      const gh = installationClient(installationId);
      try {
        const [candidates, assignable] = await Promise.all([
          reviewCandidates(repo.id, repo.workspaceId),
          cached(`assignees:${repo.id}`, 5 * MIN, () =>
            gh.listAssignees(repo.fullName),
          ),
        ]);
        const ok = new Set(assignable.map((l) => l.toLowerCase()));
        const owners = await codeownerLogins(
          { id: repo.id, fullName: repo.fullName, installationId },
          input.paths,
        );
        const ranked = rankReviewers(
          candidates.filter((c) => ok.has(c.login.toLowerCase())),
          {
            author: "",
            paths: input.paths,
            codeowners: owners,
            folderReviews: new Map(),
          },
        ).map((s) => ({ login: s.login, name: s.name, reasons: s.reasons }));
        // People a routing rule names for these paths go first, tagged as such.
        const { logins } = await ruleHits(repo, input.paths);
        const fromRules = logins
          .filter((l) => ok.has(l.toLowerCase()))
          .map((login) => {
            const known = ranked.find(
              (r) => r.login.toLowerCase() === login.toLowerCase(),
            );
            return {
              login: known?.login ?? login,
              name: known?.name ?? login,
              reasons: ["routing rule", ...(known?.reasons ?? [])],
            };
          });
        const seen = new Set(fromRules.map((r) => r.login.toLowerCase()));
        return [
          ...fromRules,
          ...ranked.filter((r) => !seen.has(r.login.toLowerCase())),
        ].slice(0, 6);
      } catch (err) {
        return githubFailure(err);
      }
    }),

  create: protectedProcedure
    .input(
      repoIn.extend({
        title: z
          .string()
          .min(1)
          .max(MAX_TITLE * 2),
        body: z.string().max(MAX_BODY),
        type: z.enum(["bug", "feature", "task"]),
        labels: z.array(z.string().min(1).max(100)).max(10).default([]),
        assignees: z
          .array(z.string().regex(/^[A-Za-z0-9-]{1,39}$/))
          .max(5)
          .default([]),
        clientKey: z.string().min(8).max(64),
        alsoLinear: z.boolean().default(false),
        source: z
          .enum(["board", "palette", "shortcut", "link", "comment"])
          .default("board"),
        hadTrace: z.boolean().default(false),
        followUp: z
          .object({
            repo: z.string().max(200),
            number: z.number().int().positive(),
            headSha: z.string().regex(/^[a-f0-9]{40}$/),
            commentId: z.number().int().positive().optional(),
            path: z.string().max(500).optional(),
            line: z.number().int().positive().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const repo = await repoForAction(ctx.user.id, input.repo, "review.act");
      const sourceRepo = input.followUp
        ? await repoForUser(ctx.user.id, input.followUp.repo)
        : null;
      if (sourceRepo && sourceRepo.workspaceId !== repo.workspaceId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Follow-up issues must stay in the same workspace",
        });
      if (sourceRepo && input.followUp) {
        const [source] = await db
          .select()
          .from(schema.pullRequest)
          .where(
            and(
              eq(schema.pullRequest.repoId, sourceRepo.id),
              eq(schema.pullRequest.number, input.followUp.number),
            ),
          );
        if (!source)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Source PR not found",
          });
      }
      async function linkFollowUp(creationId: string, issueNumber: number) {
        if (!sourceRepo || !input.followUp) return;
        const f = input.followUp;
        await db
          .insert(schema.reviewFollowUp)
          .values({
            creationId,
            repoId: sourceRepo.id,
            prNumber: f.number,
            headSha: f.headSha,
            commentId: f.commentId,
            path: f.path,
            line: f.line,
            targetRepoId: repo.id,
            issueNumber,
          })
          .onConflictDoNothing();
      }
      const title = cleanTitle(input.title);
      if (!title)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add a title" });

      // Claim the key first: a double click or retry can't create a second issue.
      const id = randomUUID();
      const claimed = await db
        .insert(schema.issueCreation)
        .values({
          id,
          userId: ctx.user.id,
          repoId: repo.id,
          clientKey: input.clientKey,
          number: 0,
          url: "",
        })
        .onConflictDoNothing()
        .returning({ id: schema.issueCreation.id });
      if (!claimed.length) {
        const [prior] = await db
          .select()
          .from(schema.issueCreation)
          .where(
            and(
              eq(schema.issueCreation.userId, ctx.user.id),
              eq(schema.issueCreation.clientKey, input.clientKey),
            ),
          );
        if (
          input.followUp &&
          prior &&
          prior.number === 0 &&
          prior.repoId === repo.id &&
          Date.now() - prior.createdAt.getTime() > 30000
        ) {
          const client = installationClient(await installationOf(repo.id));
          const found = (
            await client.listIssues(repo.fullName, {
              state: "all",
              since: prior.createdAt.toISOString(),
            })
          ).filter((i) =>
            i.body?.includes(`<!-- docks-follow-up:${prior.id} -->`),
          );
          if (found.length === 1) {
            await db
              .update(schema.issueCreation)
              .set({ number: found[0]!.number, url: found[0]!.html_url })
              .where(eq(schema.issueCreation.id, prior.id));
            prior.number = found[0]!.number;
            prior.url = found[0]!.html_url;
          }
        }
        if (prior && prior.number > 0) {
          if (prior.repoId !== repo.id)
            throw new TRPCError({
              code: "CONFLICT",
              message: "This creation key belongs to another repository",
            });
          await linkFollowUp(prior.id, prior.number);
          return {
            number: prior.number,
            url: prior.url,
            branch: branchName(input.type, prior.number, title),
            dropped: { labels: [] as string[], assignees: [] as string[] },
            replayed: true,
            byApp: false,
            linear: null,
            linearError: null,
          };
        }
        throw new TRPCError({
          code: "CONFLICT",
          message: "This issue is already being created",
        });
      }

      try {
        limit(
          ctx.user.id,
          "create",
          10,
          MIN,
          "You're creating issues quickly. Try again in a minute.",
        );
        // No linked GitHub account (or it needs reconnecting): the App files it on their behalf and says so.
        const asUser = (await githubIdentity(ctx.user.id)) !== null;
        const provenance = input.followUp
          ? `\n\nReview follow-up: https://github.com/${input.followUp.repo}/pull/${input.followUp.number}\nSource commit: ${input.followUp.headSha}${input.followUp.path ? `\nCode: https://github.com/${input.followUp.repo}/blob/${input.followUp.headSha}/${input.followUp.path.split("/").map(encodeURIComponent).join("/")}${input.followUp.line ? `#L${input.followUp.line}` : ""}` : ""}`
          : "";
        const payload = {
          title,
          body:
            input.body +
            provenance +
            (input.followUp ? `\n<!-- docks-follow-up:${id} -->` : ""),
          labels: input.labels,
          assignees: input.assignees,
        };
        const viaUser = async () => {
          if (!asUser)
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "not linked",
            });
          return githubAs(ctx.user.id).createIssue(repo.fullName, payload);
        };
        let byApp = !asUser;
        const created = await viaUser()
          .catch(async (err) => {
            if (!(
              err instanceof TRPCError && err.code === "PRECONDITION_FAILED"
            ))
              throw err;
            byApp = true;
            return installationClient(
              await installationOf(repo.id),
            ).createIssue(repo.fullName, {
              ...payload,
              body: `> Requested by ${ctx.user.name} via Docks\n\n${payload.body}`,
            });
          })
          .catch(createFailure);
        const dropped = unapplied(
          { labels: input.labels, assignees: input.assignees },
          {
            labels: created.labels.map((l) =>
              typeof l === "string" ? l : l.name,
            ),
            assignees: (created.assignees ?? []).map((a) => a.login),
          },
        );
        await db
          .update(schema.issueCreation)
          .set({ number: created.number, url: created.html_url })
          .where(eq(schema.issueCreation.id, id));
        await linkFollowUp(id, created.number);
        await enqueue("sync_issue", {
          repoId: repo.id,
          number: created.number,
        });
        await audit(
          repo.workspaceId,
          ctx.user.id,
          "issue.create",
          `${repo.fullName}#${created.number}`,
          { type: input.type },
        );
        await track(ctx.user.id, repo.workspaceId, "issue_created", {
          source: input.source,
          type: input.type,
          hadTrace: input.hadTrace,
          labels: input.labels.length,
          assignees: input.assignees.length,
        });
        // Optional Linear copy. A Linear failure never undoes the GitHub issue; it's reported next to it.
        let linear: { id: string; url: string } | null = null;
        let linearError: string | null = null;
        if (input.alsoLinear) {
          const [row] = await db
            .select()
            .from(schema.linearIntegration)
            .where(eq(schema.linearIntegration.workspaceId, repo.workspaceId));
          if (!row?.defaultTeamId)
            linearError = "Linear isn't set up for new issues.";
          else {
            try {
              linear = await createLinearIssue(decrypt(row.apiKeyEncrypted), {
                teamId: row.defaultTeamId,
                title,
                description: `${input.body}\n\n[GitHub: ${repo.fullName}#${created.number}](${created.html_url})`,
              });
            } catch (err) {
              linearError = (err as Error).message;
            }
          }
        }
        return {
          number: created.number,
          url: created.html_url,
          branch: branchName(input.type, created.number, title),
          dropped,
          replayed: false,
          byApp,
          linear,
          linearError,
        };
      } catch (err) {
        // An ambiguous provider failure may already have created a follow-up.
        // Keep its key; a later retry reconciles the marker instead of posting again.
        const definitelyRejected =
          err instanceof TRPCError &&
          [
            "BAD_REQUEST",
            "FORBIDDEN",
            "TOO_MANY_REQUESTS",
            "PRECONDITION_FAILED",
          ].includes(err.code);
        if (!input.followUp || definitelyRejected)
          await db
            .delete(schema.issueCreation)
            .where(
              and(
                eq(schema.issueCreation.id, id),
                eq(schema.issueCreation.number, 0),
              ),
            );
        throw err;
      }
    }),
});
