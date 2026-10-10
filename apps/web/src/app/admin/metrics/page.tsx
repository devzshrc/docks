"use client";

import { useQuery } from "@tanstack/react-query";

import { AccountsScatter } from "@/components/charts/accounts-scatter";
import { TrendChart } from "@/components/charts/trend-chart";
import { Panel, StatStrip } from "@/components/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/trpc/react";

/** Internal beta metrics (plan §12, M8). Only for ADMIN_EMAILS. */
function Metrics() {
  const trpc = useTRPC();
  const m = useQuery(trpc.admin.metrics.queryOptions());
  const accounts = useQuery(trpc.admin.accounts.queryOptions());
  if (m.isPending) return <Skeleton className="h-48 w-full max-w-3xl" />;
  if (m.error)
    return (
      <p className="text-muted-foreground text-sm">
        This page isn&apos;t available.
      </p>
    );
  return (
    <div className="space-y-6">
      <StatStrip
        stats={[
          { label: "Signups (30 days)", value: String(m.data.signups30d) },
          {
            label: "Activated within 24h",
            value:
              m.data.activationRate === null
                ? "—"
                : `${m.data.activationRate}%`,
            sub: "Target 50%: workspace and GitHub on day one",
          },
          {
            label: "Active reviewers this week",
            value: String(m.data.weeks.at(-1)?.activeReviewers ?? 0),
          },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Weekly active reviewers" description="Last 8 weeks">
          <TrendChart
            rows={m.data.weeks.map((w) => ({
              label: w.week.slice(5),
              value: w.activeReviewers,
            }))}
            label="People"
            ariaLabel="Line chart of weekly active reviewers over the last 8 weeks"
          />
        </Panel>
        <Panel
          title="Reviews done in the app per week"
          description="Last 8 weeks"
        >
          <TrendChart
            rows={m.data.weeks.map((w) => ({
              label: w.week.slice(5),
              value: w.reviews,
            }))}
            label="Reviews"
            color="#1f567d"
            ariaLabel="Line chart of reviews submitted in the app per week over the last 8 weeks"
          />
        </Panel>
      </div>
      <Panel
        title="Accounts: estimated plan value vs. retention"
        description="Seat-price estimate, not collected revenue. Size shows seats; color shows paid plan."
      >
        {accounts.data && accounts.data.length > 0 ? (
          <AccountsScatter accounts={accounts.data} />
        ) : (
          <p className="text-muted-foreground text-sm">
            {accounts.isPending ? "Loading…" : "No accounts yet."}
          </p>
        )}
      </Panel>
    </div>
  );
}

export default function Page() {
  return (
    <div className="grid gap-6">
      <h1 className="text-title-2-medium">Beta metrics</h1>
      <Metrics />
    </div>
  );
}
