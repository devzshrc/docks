"use client";

import { useQuery } from "@tanstack/react-query";

import { AccountsScatter } from "@/components/charts/accounts-scatter";
import { AdminTrendChart } from "@/components/admin/admin-charts";
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
          <AdminTrendChart
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
          <AdminTrendChart
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
        title="AI guide feedback"
        description="Thumbs from reviewers, last 30 days. Use it alongside the guide eval."
      >
        {m.data.guideVotes.length ? (
          <StatStrip
            stats={(["summary", "step", "check"] as const).map((part) => {
              const row = m.data.guideVotes.find((v) => v.part === part);
              const total = (row?.up ?? 0) + (row?.down ?? 0);
              return {
                label: { summary: "Summary", step: "Review path steps", check: "Checklist questions" }[part],
                value: total ? `${Math.round(((row?.up ?? 0) / total) * 100)}% helpful` : "—",
                sub: `${total} vote${total === 1 ? "" : "s"}`,
              };
            })}
          />
        ) : (
          <p className="text-muted-foreground text-sm">No votes yet.</p>
        )}
      </Panel>
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
