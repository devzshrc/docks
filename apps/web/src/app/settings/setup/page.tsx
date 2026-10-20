"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RiAlertLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiRefreshLine,
} from "@remixicon/react";
import { useEffect } from "react";

import { AppShell } from "@/components/app-shell";
import { QueryError } from "@/components/query-state";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Frame, FramePanel } from "@/components/ui-compat/frame";
import { useWorkspace } from "@/hooks/use-workspace";
import { errorMessage } from "@/lib/error-message";
import { cx } from "@/utils/cx";
import { InviteSuggestions } from "@/components/setup/invite-suggestions";
import { ImportStatus } from "@/components/setup/import-status";
import { useTRPC } from "@/trpc/react";

type Status = "ok" | "warn" | "fail";
const ICON = {
  ok: RiCheckboxCircleLine,
  warn: RiAlertLine,
  fail: RiCloseCircleLine,
} as const;
const TONE = {
  ok: "text-foreground-icon-primary",
  warn: "text-foreground-icon-secondary",
  fail: "text-text-error-primary",
} as const;

function StatusLine({
  status,
  children,
}: {
  status: Status;
  children: React.ReactNode;
}) {
  const Icon = ICON[status];
  return (
    <p className="flex items-start gap-2 text-body-regular">
      <Icon
        className={cx("mt-0.5 size-4 shrink-0", TONE[status])}
        aria-label={status}
      />
      <span>{children}</span>
    </p>
  );
}

/** Ask GitHub to redeliver a recent event, then poll until it shows up here. */
function WebhookTest({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const start = useMutation(trpc.setup.webhookTest.mutationOptions());
  const pending = start.data?.guid
    ? { guid: start.data.guid, startedAt: start.data.startedAt }
    : null;
  const result = useQuery({
    ...trpc.setup.webhookTestResult.queryOptions({
      workspaceId,
      guid: pending?.guid ?? "",
      startedAt: pending?.startedAt ?? new Date(0),
    }),
    enabled: !!pending,
    refetchInterval: (q) =>
      q.state.data?.status === "ok" ||
      q.state.data?.status === "fail" ||
      Date.now() - (pending?.startedAt.getTime() ?? 0) > 30_000
        ? false
        : 2000,
  });
  const verdict = pending
    ? (result.data ?? { status: "warn" as const, detail: start.data!.detail })
    : start.data;
  useEffect(() => {
    if (result.data?.status === "ok")
      void queryClient.invalidateQueries({
        queryKey: trpc.setup.health.pathKey(),
      });
  }, [result.data?.status, queryClient, trpc]);
  return (
    <div className="grid gap-2">
      <div>
        <Button
          size="small"
          variant="secondary"
          disabled={start.isPending || (!!pending && result.isFetching)}
          onClick={() => start.mutate({ workspaceId })}
        >
          {start.isPending ? "Testing…" : "Run webhook test"}
        </Button>
      </div>
      {result.error && (
        <StatusLine status="fail">{errorMessage(result.error)}</StatusLine>
      )}
      {start.error && (
        <StatusLine status="fail">{errorMessage(start.error)}</StatusLine>
      )}
      {verdict && (
        <StatusLine status={verdict.status}>{verdict.detail}</StatusLine>
      )}
    </div>
  );
}

function AccessCheck({
  workspaceId,
  action,
}: {
  workspaceId: string;
  action: "permission_check" | "sync_access";
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.setup.health.pathKey() });
  const check = useMutation(
    trpc.setup.permissionCheck.mutationOptions({ onSuccess: refresh }),
  );
  const sync = useMutation(
    trpc.setup.syncAccess.mutationOptions({ onSuccess: refresh }),
  );
  const m = action === "permission_check" ? check : sync;
  return (
    <div className="grid gap-2">
      <div>
        <Button
          size="small"
          variant="secondary"
          disabled={m.isPending}
          onClick={() => m.mutate({ workspaceId })}
        >
          {m.isPending
            ? "Checking…"
            : action === "permission_check"
              ? "Check why"
              : "Refresh access"}
        </Button>
      </div>
      {m.error && (
        <StatusLine status="fail">{errorMessage(m.error)}</StatusLine>
      )}
      {check.data && (
        <StatusLine status={check.data.status}>{check.data.detail}</StatusLine>
      )}
      {check.data && "href" in check.data && check.data.href && (
        <ButtonLink
          size="small"
          variant="secondary"
          href={check.data.href}
          target="_blank"
          rel="noreferrer"
        >
          GitHub access settings
        </ButtonLink>
      )}
      {sync.isSuccess && (
        <StatusLine status="ok">Access refreshed from GitHub.</StatusLine>
      )}
    </div>
  );
}

function Checks({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const health = useQuery(trpc.setup.health.queryOptions({ workspaceId }));
  if (health.isPending) return <Skeleton className="h-64 w-full" />;
  if (health.error)
    return (
      <QueryError error={health.error} onRetry={() => void health.refetch()} />
    );
  const { checks, rateLimited } = health.data;
  const problems = checks.filter((c) => c.status !== "ok").length;
  return (
    <div className="grid gap-8">
      <Frame>
        <FramePanel className="grid gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-body-regular text-text-secondary">
              {problems
                ? `${problems} thing${problems === 1 ? " needs" : "s need"} attention.`
                : "Everything is connected."}
            </p>
            <Button
              size="small"
              variant="ghost"
              onClick={() => void health.refetch()}
              aria-label="Check again"
            >
              <RiRefreshLine
                className={cx("size-4", health.isFetching && "animate-spin")}
                aria-hidden
              />
            </Button>
          </div>
          <ImportStatus workspaceId={workspaceId} />
          {rateLimited && (
            <StatusLine status="warn">
              GitHub is rate-limiting this installation until{" "}
              {new Date(rateLimited.resetAt).toLocaleTimeString()}. Background
              syncs are paused; some data may be a few minutes old.
            </StatusLine>
          )}
          <ul className="divide-y divide-separator-border">
            {checks.map((c) => (
              <li
                key={c.id}
                className="grid gap-2 py-3 sm:grid-cols-[12rem_1fr]"
              >
                <p className="text-body-medium">{c.label}</p>
                <div className="grid gap-2">
                  <StatusLine status={c.status}>{c.detail}</StatusLine>
                  {c.fix?.href && c.status !== "ok" && (
                    <div>
                      <ButtonLink
                        size="small"
                        variant="secondary"
                        href={c.fix.href}
                      >
                        {c.fix.label}
                      </ButtonLink>
                    </div>
                  )}
                  {c.fix?.action === "webhook_test" && (
                    <WebhookTest workspaceId={workspaceId} />
                  )}
                  {(c.fix?.action === "permission_check" ||
                    c.fix?.action === "sync_access") && (
                    <AccessCheck
                      workspaceId={workspaceId}
                      action={c.fix.action}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </FramePanel>
      </Frame>
      {health.data.canManage && <FailedJobs workspaceId={workspaceId} />}
      {health.data.canManage && <InviteSuggestions workspaceId={workspaceId} />}
    </div>
  );
}

function FailedJobs({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const jobs = useQuery(trpc.setup.failedJobs.queryOptions({ workspaceId }));
  const retry = useMutation(
    trpc.setup.retryJob.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.setup.failedJobs.pathKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.setup.health.pathKey(),
        });
      },
    }),
  );
  if (jobs.isPending) return <Skeleton className="h-16 w-full" />;
  if (jobs.error)
    return (
      <QueryError error={jobs.error} onRetry={() => void jobs.refetch()} />
    );
  if (!jobs.data.length) return null;
  const label: Record<string, string> = {
    sync_pr: "Pull request sync",
    sync_repo: "Repository sync",
    generate_guide: "AI walkthrough",
    sync_issues: "Issue import",
    sync_issue: "Issue sync",
    auto_assign: "Auto-assign",
    apply_rules: "Routing rules",
  };
  return (
    <section className="grid gap-3">
      <h2 className="text-body-medium">Failed in the last week</h2>
      <Frame>
        <FramePanel className="divide-y divide-separator-border p-0">
          {jobs.data.map((j) => (
            <div
              key={j.id}
              className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
            >
              <div className="grid gap-1">
                <p className="text-body-medium">
                  {label[j.type] ?? j.type}
                  {j.repo && (
                    <span className="font-normal text-text-secondary">
                      {" "}
                      · {j.repo}
                      {j.number ? `#${j.number}` : ""}
                    </span>
                  )}
                </p>
                <p className="text-body-regular text-text-secondary">
                  {j.reason}
                </p>
                <p className="text-caption-1-regular text-text-tertiary">
                  {new Date(j.failedAt).toLocaleString()} · {j.attempts} attempt
                  {j.attempts === 1 ? "" : "s"}
                </p>
              </div>
              {j.retryable && (
                <Button
                  size="small"
                  variant="secondary"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate({ workspaceId, jobId: j.id })}
                >
                  Retry
                </Button>
              )}
            </div>
          ))}
        </FramePanel>
      </Frame>
      {retry.error && (
        <p className="text-body-regular text-text-error-primary">
          {errorMessage(retry.error)}
        </p>
      )}
    </section>
  );
}

function Content() {
  const { workspace, isPending } = useWorkspace();
  if (isPending) return null;
  if (!workspace)
    return (
      <p className="text-body-regular text-text-secondary">
        You aren&apos;t in a workspace yet.
      </p>
    );
  return (
    <div className="grid gap-8">
      <Checks workspaceId={workspace.id} />
    </div>
  );
}

export default function Page() {
  return (
    <AppShell
      title="Setup"
      description="What's connected, what isn't, and how to fix it."
    >
      <Content />
    </AppShell>
  );
}
