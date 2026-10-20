import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, assertMember, audit, can } from "../access.js";
import { RETRYABLE_JOBS } from "../admin-policy.js";
import { logError } from "../logger.js";
import {
  githubAs,
  githubIdentity,
  syncUserRepos,
} from "../review/github-user.js";
import {
  appHooks,
  getInstallation,
  installationRateLimit,
  isLow,
} from "../review/github.js";
import {
  explainJobError,
  inviteCandidates,
  missingPermissions,
  webhookCheck,
  webhookTestVerdict,
  type SetupCheck,
} from "../setup.js";
import { protectedProcedure, router } from "../trpc.js";

const ws = z.object({ workspaceId: z.string() });

async function workspaceGithub(workspaceId: string) {
  const installations = await db
    .select()
    .from(schema.githubInstallation)
    .where(eq(schema.githubInstallation.workspaceId, workspaceId));
  const repos = installations.length
    ? await db
        .select({
          id: schema.repository.id,
          fullName: schema.repository.fullName,
          enabled: schema.repository.enabled,
          aiEnabled: schema.repository.aiEnabled,
        })
        .from(schema.repository)
        .where(
          inArray(
            schema.repository.installationId,
            installations.map((i) => i.id),
          ),
        )
    : [];
  return { installations, repos };
}

const expectedWebhookUrl = () =>
  `${(process.env.BETTER_AUTH_URL ?? "http://localhost:4000").replace(/\/$/, "")}/webhooks/github`;

/** Repo-scoped job types a workspace owner can see and retry. */
const REPO_JOBS = [
  "sync_repo",
  "sync_pr",
  "generate_guide",
  "auto_assign",
  "apply_rules",
  "sync_issues",
  "sync_issue",
] as const;

export const setupRouter = router({
  /** Lightweight import status: safe to poll while background imports run. */
  importProgress: protectedProcedure.input(ws).query(async ({ ctx, input }) => {
    await assertMember(ctx.user.id, input.workspaceId);
    const { installations, repos } = await workspaceGithub(input.workspaceId);
    const ids = repos.filter((r) => r.enabled).map((r) => r.id);
    if (!ids.length)
      return { discovering: 0, pending: 0, imported: 0, rateLimited: null };
    const [jobs, pulls, budgets] = await Promise.all([
      db
        .select({
          discovering: sql<number>`count(*) FILTER (WHERE ${schema.jobs.type} = 'sync_repo')::int`,
          pending: sql<number>`count(*) FILTER (WHERE ${schema.jobs.type} = 'sync_pr')::int`,
        })
        .from(schema.jobs)
        .where(
          and(
            inArray(schema.jobs.status, ["queued", "running"]),
            inArray(schema.jobs.type, ["sync_repo", "sync_pr"]),
            sql`${schema.jobs.payload}->>'repoId' IN (${sql.join(
              ids.map((id) => sql`${String(id)}`),
              sql`, `,
            )})`,
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.pullRequest)
        .where(
          and(
            inArray(schema.pullRequest.repoId, ids),
            eq(schema.pullRequest.state, "open"),
          ),
        ),
      Promise.all(installations.map((i) => installationRateLimit(i.id))),
    ]);
    const low = budgets.filter(isLow);
    // Pending syncs may include existing PRs: do not pretend to know an exact total.
    return {
      discovering: jobs[0]?.discovering ?? 0,
      pending: jobs[0]?.pending ?? 0,
      imported: pulls[0]?.n ?? 0,
      rateLimited: low.length
        ? { resetAt: new Date(Math.max(...low.map((b) => b!.resetAt))) }
        : null,
    };
  }),
  /** Everything that has to be connected for Docks to work, with what to do about each gap. */
  health: protectedProcedure.input(ws).query(async ({ ctx, input }) => {
    const member = await assertMember(ctx.user.id, input.workspaceId);
    const manage = can(member.role, "integrations.manage");
    const { installations, repos } = await workspaceGithub(input.workspaceId);
    const enabled = repos.filter((r) => r.enabled);
    const checks: SetupCheck[] = [];

    // GitHub App
    const suspended = installations.filter((i) => i.suspendedAt);
    checks.push(
      !installations.length
        ? {
            id: "github_app",
            label: "GitHub App",
            status: "fail",
            detail: "The Docks GitHub App isn't installed for this workspace.",
            fix: { label: "Install the App", href: "/settings/integrations" },
          }
        : suspended.length
          ? {
              id: "github_app",
              label: "GitHub App",
              status: "fail",
              detail: `Suspended on ${suspended.map((i) => i.accountLogin).join(", ")}. An org owner can unsuspend it in GitHub settings.`,
            }
          : {
              id: "github_app",
              label: "GitHub App",
              status: "ok",
              detail: `Installed on ${installations.map((i) => i.accountLogin).join(", ")}.`,
            },
    );

    // App permissions (live from GitHub; skipped quietly if the App can't be reached)
    if (installations.length) {
      const missing: string[] = [];
      const unavailable: string[] = [];
      for (const inst of installations) {
        try {
          for (const m of missingPermissions(
            (await getInstallation(inst.id)).permissions,
          ))
            missing.push(`${inst.accountLogin}: ${m}`);
        } catch {
          unavailable.push(inst.accountLogin);
        }
      }
      checks.push(
        missing.length
          ? {
              id: "app_permissions",
              label: "App permissions",
              status: "warn",
              detail: `Not granted: ${missing.join("; ")}. An org owner can accept them in GitHub → Settings → GitHub Apps.`,
            }
          : unavailable.length
            ? {
                id: "app_permissions",
                label: "App permissions",
                status: "warn",
                detail: `Could not verify permissions for ${unavailable.join(", ")}. Check the App connection and try again.`,
              }
            : {
                id: "app_permissions",
                label: "App permissions",
                status: "ok",
                detail: "Everything Docks needs is granted.",
              },
      );
    }

    // Webhooks
    if (installations.length) {
      const deliveries = await db
        .select({
          result: schema.webhookDelivery.result,
          receivedAt: schema.webhookDelivery.receivedAt,
          reason: schema.webhookDelivery.reason,
        })
        .from(schema.webhookDelivery)
        .where(
          and(
            inArray(
              schema.webhookDelivery.installationId,
              installations.map((i) => i.id),
            ),
            gte(
              schema.webhookDelivery.receivedAt,
              new Date(Date.now() - 30 * 24 * 3_600_000),
            ),
          ),
        )
        .orderBy(desc(schema.webhookDelivery.receivedAt))
        .limit(200);
      const check = webhookCheck(deliveries);
      checks.push(manage ? check : { ...check, fix: undefined });
    }

    // Repositories
    checks.push(
      enabled.length
        ? {
            id: "repos",
            label: "Repositories",
            status: "ok",
            detail: `${enabled.length} of ${repos.length} enabled.`,
          }
        : {
            id: "repos",
            label: "Repositories",
            status: "fail",
            detail: repos.length
              ? "Every repository is turned off."
              : "No repositories yet.",
            fix: {
              label: "Choose repositories",
              href: "/settings/repositories",
            },
          },
    );

    // This person's GitHub connection and access
    const identity = await githubIdentity(ctx.user.id);
    if (!identity) {
      checks.push({
        id: "my_github",
        label: "Your GitHub account",
        status: "warn",
        detail:
          "Not connected, so code and review actions are hidden from you.",
        fix: { label: "Connect GitHub", href: "/settings/integrations" },
      });
    } else {
      const access = await db
        .select({ repoId: schema.githubRepoAccess.repoId })
        .from(schema.githubRepoAccess)
        .where(eq(schema.githubRepoAccess.userId, ctx.user.id));
      const visible = enabled.filter((r) =>
        access.some((a) => a.repoId === r.id),
      ).length;
      checks.push(
        enabled.length && visible === 0
          ? {
              id: "my_access",
              label: "Your repository access",
              status: "warn",
              detail: `Connected as ${identity.login}, but GitHub shows you none of this workspace's repositories.`,
              fix: { label: "Check why", action: "permission_check" },
            }
          : {
              id: "my_access",
              label: "Your repository access",
              status: "ok",
              detail: `Connected as ${identity.login}; you can see ${visible} of ${enabled.length} repositories.`,
              fix: { label: "Refresh access", action: "sync_access" },
            },
      );
    }

    // Slack and AI
    const [slack] = await db
      .select({ channel: schema.slackIntegration.channelName })
      .from(schema.slackIntegration)
      .where(eq(schema.slackIntegration.workspaceId, input.workspaceId));
    checks.push(
      slack
        ? {
            id: "slack",
            label: "Slack",
            status: "ok",
            detail: `Posting to #${slack.channel}.`,
          }
        : {
            id: "slack",
            label: "Slack",
            status: "warn",
            detail:
              "Not connected. Connect it for the daily stuck-PR digest and deadline alerts.",
            fix: { label: "Connect Slack", href: "/settings/integrations" },
          },
    );
    const aiRepos = enabled.filter((r) => r.aiEnabled).length;
    checks.push(
      !process.env.OPENAI_API_KEY
        ? {
            id: "ai",
            label: "AI walkthroughs",
            status: "warn",
            detail:
              "The server has no OpenAI key, so reviews use the folder-grouped tour and Ask is off.",
          }
        : {
            id: "ai",
            label: "AI walkthroughs",
            status: "ok",
            detail: `On for ${aiRepos} of ${enabled.length} repositories.`,
          },
    );

    // Import progress, failed jobs, GitHub budget
    const repoIds = repos.map((r) => String(r.id));
    const [jobs] = repoIds.length
      ? (
          await db.execute<{ queued: number; failed: number }>(sql`
            SELECT count(*) FILTER (WHERE status IN ('queued', 'running') AND type IN ('sync_repo', 'sync_pr'))::int AS queued,
                   count(*) FILTER (WHERE status = 'failed' AND updated_at > now() - interval '7 days'
                     AND type IN (${sql.join(
                       REPO_JOBS.map((t) => sql`${t}`),
                       sql`, `,
                     )}))::int AS failed
            FROM ${schema.jobs}
            WHERE payload->>'repoId' IN (${sql.join(
              repoIds.map((id) => sql`${id}`),
              sql`, `,
            )})`)
        ).rows
      : [{ queued: 0, failed: 0 }];
    const [mirrored] = repos.length
      ? await db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.pullRequest)
          .where(
            and(
              inArray(
                schema.pullRequest.repoId,
                repos.map((r) => r.id),
              ),
              eq(schema.pullRequest.state, "open"),
            ),
          )
      : [{ n: 0 }];
    const budgets = await Promise.all(
      installations.map((i) => installationRateLimit(i.id)),
    );
    const low = budgets.filter(isLow);

    return {
      checks,
      canManage: manage,
      import: { pending: jobs?.queued ?? 0, openPrs: mirrored?.n ?? 0 },
      failedJobs: manage ? (jobs?.failed ?? 0) : 0,
      rateLimited: low.length
        ? { resetAt: new Date(Math.max(...low.map((b) => b!.resetAt))) }
        : null,
    };
  }),

  /**
   * Webhook self-test: compare the App's configured URL with ours, then ask
   * GitHub to redeliver a recent event and watch for it to arrive here.
   */
  webhookTest: protectedProcedure.input(ws).mutation(async ({ ctx, input }) => {
    await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
    const { installations } = await workspaceGithub(input.workspaceId);
    if (!installations.length)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Install the GitHub App first.",
      });
    try {
      const [config, deliveries] = await Promise.all([
        appHooks.config(),
        appHooks.deliveries(),
      ]);
      const ours = new Set(installations.map((i) => i.id));
      const latest = deliveries.find(
        (d) => d.installation_id && ours.has(d.installation_id),
      );
      const urlVerdict = webhookTestVerdict({
        configuredUrl: config.url,
        expectedUrl: expectedWebhookUrl(),
        githubStatusCode: latest?.status_code ?? null,
        receivedByUs: false,
      });
      if (
        urlVerdict.status === "fail" &&
        config.url.replace(/\/$/, "") !== expectedWebhookUrl()
      )
        return { ...urlVerdict, guid: null, startedAt: new Date() };
      if (!latest)
        return {
          status: "warn" as const,
          detail:
            "GitHub has no recent deliveries for this workspace to replay. Open or update a pull request, then test again.",
          guid: null,
          startedAt: new Date(),
        };
      const startedAt = new Date();
      await appHooks.redeliver(latest.id);
      return {
        status: "warn" as const,
        detail:
          "Asked GitHub to redeliver a recent event. Waiting for it to arrive…",
        guid: latest.guid,
        startedAt,
      };
    } catch (err) {
      logError("setup.webhook_test_failed", err);
      return {
        status: "fail" as const,
        detail:
          "Couldn't reach GitHub as the App. Check GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY on the server.",
        guid: null,
        startedAt: new Date(),
      };
    }
  }),

  /** Poll after webhookTest: did the redelivered event reach us, and what did GitHub see? */
  webhookTestResult: protectedProcedure
    .input(ws.extend({ guid: z.string().max(100), startedAt: z.date() }))
    .query(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
      const { installations } = await workspaceGithub(input.workspaceId);
      if (!installations.length)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Install the GitHub App first.",
        });
      const installationIds = installations.map((i) => i.id);
      const [received] = await db
        .select({ result: schema.webhookDelivery.result })
        .from(schema.webhookDelivery)
        .where(
          and(
            eq(schema.webhookDelivery.deliveryId, input.guid),
            inArray(schema.webhookDelivery.installationId, installationIds),
            gte(schema.webhookDelivery.receivedAt, input.startedAt),
          ),
        )
        .limit(1);
      let statusCode: number | null = null;
      if (!received) {
        try {
          const attempt = (await appHooks.deliveries()).find(
            (d) =>
              !!d.installation_id &&
              installationIds.includes(d.installation_id) &&
              d.guid === input.guid &&
              d.redelivery &&
              new Date(d.delivered_at) >= input.startedAt,
          );
          statusCode = attempt?.status_code ?? null;
        } catch {
          /* report from our side only */
        }
      }
      return webhookTestVerdict({
        configuredUrl: null,
        expectedUrl: expectedWebhookUrl(),
        githubStatusCode: statusCode,
        receivedByUs: received?.result === "ok",
      });
    }),

  /** Why can't I see this workspace's repositories? Asks GitHub as the signed-in person. */
  permissionCheck: protectedProcedure
    .input(ws)
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.user.id, input.workspaceId);
      const identity = await githubIdentity(ctx.user.id);
      if (!identity)
        return {
          status: "warn" as const,
          detail:
            "Connect your GitHub account first (Settings → Integrations).",
        };
      const { installations } = await workspaceGithub(input.workspaceId);
      let visible: number[];
      try {
        visible = (await githubAs(ctx.user.id).installations()).map(
          (i) => i.id,
        );
      } catch {
        return {
          status: "fail" as const,
          detail:
            "GitHub didn't accept your connection. Reconnect GitHub in Settings → Integrations.",
        };
      }
      const hidden = installations.filter((i) => !visible.includes(i.id));
      if (!hidden.length) {
        await syncUserRepos(ctx.user.id);
        return {
          status: "ok" as const,
          detail: `GitHub shows you every installation. Access refreshed for ${identity.login}.`,
        };
      }
      const orgs = hidden.map((i) => i.accountLogin).join(", ");
      return {
        status: "fail" as const,
        detail: `GitHub doesn't show ${identity.login} the App on ${orgs}. Either you aren't a member of ${hidden.length === 1 ? "that organization" : "those organizations"} (or of the selected repositories), or the organization restricts third-party access: an org owner can approve Docks under Organization settings → Third-party access, or add you to the repositories.`,
        orgs: hidden.map((i) => i.accountLogin),
        href: "https://github.com/settings/connections/applications",
      };
    }),

  /** Refresh which repos this person can see on GitHub, now. */
  syncAccess: protectedProcedure.input(ws).mutation(async ({ ctx, input }) => {
    await assertMember(ctx.user.id, input.workspaceId);
    await syncUserRepos(ctx.user.id);
  }),

  /** Failed background jobs for this workspace's repos in the last week, explained. */
  failedJobs: protectedProcedure.input(ws).query(async ({ ctx, input }) => {
    await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
    const { repos } = await workspaceGithub(input.workspaceId);
    if (!repos.length) return [];
    const name = new Map(repos.map((r) => [String(r.id), r.fullName]));
    const rows = await db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.status, "failed"),
          inArray(schema.jobs.type, [...REPO_JOBS]),
          gte(schema.jobs.updatedAt, new Date(Date.now() - 7 * 24 * 3_600_000)),
          sql`${schema.jobs.payload}->>'repoId' IN (${sql.join(
            [...name.keys()].map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      )
      .orderBy(desc(schema.jobs.updatedAt))
      .limit(50);
    return rows.map((j) => {
      const p = j.payload as { repoId?: number; number?: number };
      return {
        id: j.id,
        type: j.type,
        repo: name.get(String(p.repoId)) ?? null,
        number: p.number ?? null,
        failedAt: j.updatedAt,
        attempts: j.attempts,
        reason: explainJobError(j.type, j.lastError),
        retryable:
          (RETRYABLE_JOBS as readonly string[]).includes(j.type) ||
          j.type === "generate_guide",
      };
    });
  }),

  retryJob: protectedProcedure
    .input(ws.extend({ jobId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "integrations.manage");
      const { repos } = await workspaceGithub(input.workspaceId);
      const [job] = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, input.jobId));
      const repoId = (job?.payload as { repoId?: number } | undefined)?.repoId;
      if (!job || !repos.some((r) => r.id === repoId))
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if (job.status !== "failed")
        throw new TRPCError({
          code: "CONFLICT",
          message: "Only failed jobs can be retried.",
        });
      if (
        !(RETRYABLE_JOBS as readonly string[]).includes(job.type) &&
        job.type !== "generate_guide"
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This job sends messages or changes GitHub, so it can't be retried from here.",
        });
      await db
        .update(schema.jobs)
        .set({
          status: "queued",
          attempts: 0,
          runAfter: new Date(),
          lastError: null,
        })
        .where(eq(schema.jobs.id, job.id));
      await audit(input.workspaceId, ctx.user.id, "job.retry", String(job.id), {
        type: job.type,
      });
    }),

  /** People active in this workspace's repos on GitHub who aren't members yet. */
  inviteSuggestions: protectedProcedure
    .input(ws)
    .query(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "members.manage");
      const { repos } = await workspaceGithub(input.workspaceId);
      if (!repos.length) return [];
      const ids = repos.map((r) => r.id);
      const since = new Date(Date.now() - 90 * 24 * 3_600_000);
      const [authors, reviewers, members] = await Promise.all([
        db
          .select({
            login: schema.pullRequest.authorLogin,
            n: sql<number>`count(*)::int`,
          })
          .from(schema.pullRequest)
          .where(
            and(
              inArray(schema.pullRequest.repoId, ids),
              gte(schema.pullRequest.lastActivityAt, since),
            ),
          )
          .groupBy(schema.pullRequest.authorLogin),
        db
          .select({
            login: schema.prReview.reviewerLogin,
            n: sql<number>`count(*)::int`,
          })
          .from(schema.prReview)
          .where(
            and(
              inArray(schema.prReview.repoId, ids),
              gte(schema.prReview.submittedAt, since),
            ),
          )
          .groupBy(schema.prReview.reviewerLogin),
        db
          .select({ login: schema.githubIdentity.githubLogin })
          .from(schema.workspaceMember)
          .innerJoin(
            schema.githubIdentity,
            eq(schema.githubIdentity.userId, schema.workspaceMember.userId),
          )
          .where(eq(schema.workspaceMember.workspaceId, input.workspaceId)),
      ]);
      return inviteCandidates(
        [...authors, ...reviewers],
        members.map((m) => m.login),
      );
    }),
});
