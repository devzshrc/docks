"use client"

import { useQuery } from "@tanstack/react-query"

import { RankedBars } from "@/components/charts/ranked-bars"
import { TrendChart, weekLabel } from "@/components/charts/trend-chart"
import { QueryError } from "@/components/query-state"
import { Panel, StatStrip } from "@/components/panel"
import { Skeleton } from "@/components/ui/skeleton"
import { useTRPC } from "@/trpc/react"

const days = (d: number | null) => (d === null ? "—" : `${d}d`)

export function IssueInsights({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC()
  const q = useQuery(trpc.issues.insights.queryOptions({ workspaceId }))
  if (q.isPending) return <Skeleton className="h-64 w-full rounded-md" />
  if (q.error) return <QueryError error={q.error} onRetry={() => void q.refetch()} />
  const d = q.data
  const aging = [
    { name: "Under a week", value: d.aging.week },
    { name: "1–4 weeks", value: d.aging.month },
    { name: "1–3 months", value: d.aging.quarter },
    { name: "Over 3 months", value: d.aging.older },
  ]
  return (
    <div className="space-y-6">
      <StatStrip
        stats={[
          { label: "Open issues", value: String(d.open), sub: `${d.unassigned} unassigned` },
          { label: "Stale", value: String(d.stale), sub: "no activity for 2 weeks" },
          { label: "Median time to close", value: days(d.medianDaysToClose), sub: `${d.closedLast30} closed in 30 days` },
          { label: "Opened, last 30 days", value: String(d.openedLast30), sub: d.openedLast30 > d.closedLast30 ? "backlog is growing" : "backlog is shrinking" },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Opened per week" description="Last 12 weeks">
          <TrendChart rows={d.weeks.map((w) => ({ label: weekLabel(w.week), value: w.opened }))} label="Issues opened" ariaLabel="Issues opened per week" polarity="neutral" />
        </Panel>
        <Panel title="Closed per week" description="Last 12 weeks">
          <TrendChart rows={d.weeks.map((w) => ({ label: weekLabel(w.week), value: w.closed }))} label="Issues closed" ariaLabel="Issues closed per week" color="#7c3aed" />
        </Panel>
        <Panel title="How old are the open issues" description="Since they were opened">
          <RankedBars rows={aging} label="Open issues" ariaLabel="Open issues by age" />
        </Panel>
        <Panel title="Open by repository">
          {d.byRepo.length ? <RankedBars rows={d.byRepo.map((r) => ({ name: r.repo, value: r.open }))} label="Open issues" ariaLabel="Open issues by repository" /> : <p className="text-muted-foreground text-sm">No open issues.</p>}
        </Panel>
        <Panel title="Open by assignee" className="lg:col-span-2">
          {d.byPerson.length ? <RankedBars rows={d.byPerson.map((p) => ({ name: p.login, value: p.open }))} label="Assigned open issues" ariaLabel="Open issues by assignee" /> : <p className="text-muted-foreground text-sm">Nothing is assigned.</p>}
        </Panel>
      </div>
    </div>
  )
}
