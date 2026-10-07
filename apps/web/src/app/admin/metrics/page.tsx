"use client"

import { useQuery } from "@tanstack/react-query"

import { AppShell } from "@/components/app-shell"
import { AccountsScatter } from "@/components/charts/accounts-scatter"
import { TrendChart } from "@/components/charts/trend-chart"
import { Skeleton } from "@/components/ui/skeleton"
import { useTRPC } from "@/trpc/react"

/** Internal beta metrics (plan §12, M8). Only for ADMIN_EMAILS. */
function Metrics() {
  const trpc = useTRPC()
  const m = useQuery(trpc.admin.metrics.queryOptions())
  const accounts = useQuery(trpc.admin.accounts.queryOptions())
  if (m.isPending) return <Skeleton className="h-48 w-full max-w-3xl" />
  if (m.error) return <p className="text-muted-foreground text-sm">This page isn&apos;t available.</p>
  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-muted-foreground text-sm">Signups (30 days)</p>
          <p className="text-2xl font-medium">{m.data.signups30d}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-muted-foreground text-sm">Activated within 24h</p>
          <p className="text-2xl font-medium">
            {m.data.activationRate === null ? "—" : `${m.data.activationRate}%`}
          </p>
          <p className="text-muted-foreground text-xs">Target 50%: workspace and GitHub on day one</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-muted-foreground text-sm">Active reviewers this week</p>
          <p className="text-2xl font-medium">{m.data.weeks.at(-1)?.activeReviewers ?? 0}</p>
        </div>
      </div>
      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-1 text-sm font-medium">Weekly active reviewers</h2>
          <TrendChart
            rows={m.data.weeks.map((w) => ({ label: w.week.slice(5), value: w.activeReviewers }))}
            label="People"
            ariaLabel="Line chart of weekly active reviewers over the last 8 weeks"
          />
        </div>
        <div>
          <h2 className="mb-1 text-sm font-medium">Reviews done in the app per week</h2>
          <TrendChart
            rows={m.data.weeks.map((w) => ({ label: w.week.slice(5), value: w.reviews }))}
            label="Reviews"
            color="#0d9488"
            ariaLabel="Line chart of reviews submitted in the app per week over the last 8 weeks"
          />
        </div>
      </section>
      <section>
        <h2 className="mb-1 text-sm font-medium">Accounts: revenue vs. retention</h2>
        <p className="text-muted-foreground mb-2 text-xs">
          One point per workspace. Size shows seats; color shows plan.
        </p>
        {accounts.data && accounts.data.length > 0 ? (
          <AccountsScatter accounts={accounts.data} />
        ) : (
          <p className="text-muted-foreground text-sm">{accounts.isPending ? "Loading…" : "No accounts yet."}</p>
        )}
      </section>
    </div>
  )
}

export default function Page() {
  return (
    <AppShell title="Metrics" description="Internal product metrics for the beta.">
      <Metrics />
    </AppShell>
  )
}
