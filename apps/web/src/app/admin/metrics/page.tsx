"use client"

import { useQuery } from "@tanstack/react-query"

import { AppShell } from "@/components/app-shell"
import { Skeleton } from "@/components/ui/skeleton"
import { useTRPC } from "@/trpc/react"

/** Internal beta metrics (plan §12, M8). Only for ADMIN_EMAILS. */
function Metrics() {
  const trpc = useTRPC()
  const m = useQuery(trpc.admin.metrics.queryOptions())
  if (m.isPending) return <Skeleton className="h-48 w-full max-w-3xl" />
  if (m.error) return <p className="text-muted-foreground text-sm">This page isn&apos;t available.</p>
  const max = Math.max(1, ...m.data.weeks.map((w) => w.activeReviewers))
  return (
    <div className="max-w-3xl space-y-6">
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
      <section>
        <h2 className="mb-2 text-sm font-medium">Weekly active reviewers and reviews done in the app</h2>
        <ul className="space-y-1.5">
          {m.data.weeks.map((w) => (
            <li key={w.week} className="grid grid-cols-[6rem_minmax(0,1fr)_7rem] items-center gap-3 text-sm">
              <span className="text-muted-foreground font-mono text-xs">{w.week}</span>
              <div className="bg-muted h-2 rounded-full" aria-hidden>
                <div className="h-2 rounded-full bg-sky-600" style={{ width: `${(w.activeReviewers / max) * 100}%` }} />
              </div>
              <span className="text-right tabular-nums">
                {w.activeReviewers} · {w.reviews} reviews
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default function Page() {
  return (
    <AppShell title="Metrics">
      <Metrics />
    </AppShell>
  )
}
