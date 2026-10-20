"use client";

import { ButtonLink } from "@/components/base/buttons/button";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { QueryError } from "@/components/query-state";
import { AppShell } from "@/components/app-shell";
import { RankedBars } from "@/components/charts/ranked-bars";
import { TrendChart, weekLabel } from "@/components/charts/trend-chart";
import { Panel, StatStrip } from "@/components/panel";
import { ShellFilters } from "@/components/shell-slots";
import { FilterSelect, ToggleChip } from "@/components/toolbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import { useTRPC } from "@/trpc/react";

const fmt = (h: number | null) =>
  h === null ? "—" : h < 48 ? `${h}h` : `${Math.round((h / 24) * 10) / 10}d`;

function Insights({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const [days, setDays] = useState(30);
  const [repoId, setRepoId] = useState<number>();
  const [teamId, setTeamId] = useState<string>();
  const [perPerson, setPerPerson] = useState(false);
  const teams = useQuery(trpc.people.teams.queryOptions({ workspaceId }));
  const data = useQuery(
    trpc.insights.summary.queryOptions({
      workspaceId,
      days,
      repoId,
      teamId,
      perPerson,
    }),
  );

  return (
    <div className="space-y-6">
      <ShellFilters>
        <FilterSelect
          label="Range"
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={[
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
            { value: "90", label: "Last 90 days" },
          ]}
        />
        <FilterSelect
          label="Repository"
          value={String(repoId ?? "")}
          onChange={(v) => setRepoId(v ? Number(v) : undefined)}
          options={[
            { value: "", label: "All" },
            ...(data.data?.repoOptions.map((r) => ({
              value: String(r.id),
              label: r.fullName,
            })) ?? []),
          ]}
        />
        {teams.data && teams.data.length > 0 && (
          <FilterSelect
            label="Team"
            value={teamId ?? ""}
            onChange={(v) => setTeamId(v || undefined)}
            options={[
              { value: "", label: "All" },
              ...teams.data.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        )}
        {data.data?.canSeePeople && (
          <ToggleChip
            on={perPerson}
            label="Per person"
            onChange={setPerPerson}
          />
        )}
      </ShellFilters>

      {data.isPending ? (
        <Skeleton className="h-64 w-full rounded-md" />
      ) : data.error ? (
        <QueryError error={data.error} onRetry={() => void data.refetch()} />
      ) : (
        <>
          {data.data.opened === 0 && data.data.merged === 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border-button-default bg-background-primary-default p-5 text-body-regular text-text-secondary">
              <p>
                No pull request activity in this range. Review and merge pull
                requests to build these trends, or choose a wider range.
              </p>
              <ButtonLink size="small" variant="secondary" href="/review">
                Open review board
              </ButtonLink>
            </div>
          )}
          <StatStrip
            stats={[
              {
                label: "Time to first review",
                value: fmt(data.data.timeToFirstReview.medianHours),
                sub: `median · slowest 10% ${fmt(data.data.timeToFirstReview.p90Hours)}`,
              },
              {
                label: "Opened to merged",
                value: fmt(data.data.cycleTime.medianHours),
                sub: `median · ${data.data.cycleTime.sample} merged`,
              },
              {
                label: "PRs opened",
                value: String(data.data.opened),
                sub: `${data.data.unreviewed} without a review`,
              },
              {
                label: "PRs merged",
                value: String(data.data.merged),
                sub: `${data.data.opened ? Math.round((data.data.merged / data.data.opened) * 100) : 0}% of opened`,
              },
            ]}
          />

          <section className="grid gap-4 md:grid-cols-2">
            <Panel
              title="Merged per week"
              description="Weekly trend, always the last 12 weeks"
            >
              <TrendChart
                rows={data.data.trend.map((w) => ({
                  label: weekLabel(w.week),
                  value: w.merged,
                }))}
                label="PRs merged"
                ariaLabel="Line chart of pull requests merged per week over the last 12 weeks"
              />
            </Panel>
            <Panel
              title="Time to first review"
              description="Weekly median, always the last 12 weeks"
            >
              <TrendChart
                rows={data.data.trend.map((w) => ({
                  label: weekLabel(w.week),
                  value: w.medianHoursToFirstReview,
                }))}
                label="Median hours"
                format={(v) => fmt(v)}
                polarity="lower"
                color="var(--hue-teal)"
                ariaLabel="Line chart of median hours to first review per week over the last 12 weeks"
              />
            </Panel>
          </section>

          <Panel
            title="PR size"
            description="Pull requests opened in this range"
          >
            <div
              className="flex h-2 gap-0.5 overflow-hidden rounded-sm"
              aria-hidden
            >
              {(["S", "M", "L"] as const).map((k, i) => (
                <div
                  key={k}
                  className={["bg-success", "bg-warning", "bg-danger"][i]}
                  style={{
                    width: `${(data.data.sizes[k] / Math.max(1, data.data.opened)) * 100}%`,
                  }}
                />
              ))}
            </div>
            <dl className="text-muted-foreground mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs">
              {(
                [
                  ["S", "Small (<100 lines)", "bg-success"],
                  ["M", "Medium", "bg-warning"],
                  ["L", "Large (500+)", "bg-danger"],
                ] as const
              ).map(([k, label, dot]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className={`${dot} size-2 rounded-full`} aria-hidden />
                  <dt>{label}</dt>
                  <dd className="text-foreground tabular-nums">
                    {data.data.sizes[k]}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          {data.data.repos.length === 1 && (
            // One bar filling the whole panel looks alarming and compares nothing; say it instead.
            <Panel
              title="Time to first review by repository"
              description="Median time to first review"
            >
              <p className="text-sm">
                <span className="font-medium">{data.data.repos[0]!.repo}</span>{" "}
                gets a first review in{" "}
                <span className="font-medium tabular-nums">
                  {fmt(data.data.repos[0]!.medianHoursToFirstReview ?? 0)}
                </span>{" "}
                on median across {data.data.repos[0]!.prs} PRs. Rankings appear
                once more repositories are enabled.
              </p>
            </Panel>
          )}
          {data.data.repos.length > 1 && (
            <Panel
              title="Slowest repositories"
              description="Median time to first review"
            >
              <RankedBars
                rows={data.data.repos.map((r) => ({
                  name: r.repo,
                  value: r.medianHoursToFirstReview ?? 0,
                  note: `${r.prs} PRs`,
                }))}
                label="Median hours to first review"
                color="var(--hue-amber)"
                format={(v) => fmt(v)}
                ariaLabel="Bar chart of repositories ranked by median hours to first review"
              />
            </Panel>
          )}

          {data.data.reviewers && (
            <Panel
              title="Reviewer response time"
              description="Visible to owners and admins only. Use it to rebalance load, not to rank people."
            >
              <RankedBars
                rows={data.data.reviewers.map((r) => ({
                  name: r.login,
                  value: r.medianHoursToReview ?? 0,
                  note: `${r.reviews} reviews`,
                }))}
                label="Median hours to their first review"
                format={(v) => fmt(v)}
                color="var(--hue-purple)"
                ariaLabel="Bar chart of reviewers ranked by median hours from PR opened to their first review"
              />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function Content() {
  const { workspace, isPending } = useWorkspace();
  if (isPending) return null;
  if (!workspace)
    return (
      <p className="text-muted-foreground text-sm">
        You aren&apos;t in a workspace yet.
      </p>
    );
  return <Insights workspaceId={workspace.id} />;
}

export default function Page() {
  return (
    <AppShell
      title="Insights"
      description="How quickly pull requests get reviewed and merged, and where they slow down."
    >
      <Content />
    </AppShell>
  );
}
