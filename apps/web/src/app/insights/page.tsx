"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { AppShell } from "@/components/app-shell"
import { RankedBars } from "@/components/charts/ranked-bars"
import { TrendChart } from "@/components/charts/trend-chart"
import { Skeleton } from "@/components/ui/skeleton"
import { useWorkspace } from "@/hooks/use-workspace"
import { useTRPC } from "@/trpc/react"

const SELECT = "border-input bg-background h-9 rounded-lg border px-2 text-sm"
const fmt = (h: number | null) => (h === null ? "—" : h < 48 ? `${h}h` : `${Math.round((h / 24) * 10) / 10}d`)

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-2xl font-medium tabular-nums">{value}</p>
      {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
    </div>
  )
}

function Insights({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC()
  const [days, setDays] = useState(30)
  const [repoId, setRepoId] = useState<number>()
  const [teamId, setTeamId] = useState<string>()
  const [perPerson, setPerPerson] = useState(false)
  const teams = useQuery(trpc.people.teams.queryOptions({ workspaceId }))
  const data = useQuery(trpc.insights.summary.queryOptions({ workspaceId, days, repoId, teamId, perPerson }))

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <select className={SELECT} aria-label="Range" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <select className={SELECT} aria-label="Repository" value={repoId ?? ""} onChange={(e) => setRepoId(e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">All repositories</option>
          {data.data?.repoOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.fullName}
            </option>
          ))}
        </select>
        {teams.data && teams.data.length > 0 && (
          <select className={SELECT} aria-label="Team" value={teamId ?? ""} onChange={(e) => setTeamId(e.target.value || undefined)}>
            <option value="">All teams</option>
            {teams.data.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {data.data?.canSeePeople && (
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4" checked={perPerson} onChange={(e) => setPerPerson(e.target.checked)} />
            Show per-person numbers
          </label>
        )}
      </div>

      {data.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : data.error ? (
        <p className="text-destructive text-sm">{data.error.message}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Time to first review"
              value={fmt(data.data.timeToFirstReview.medianHours)}
              sub={`median · slowest 10% ${fmt(data.data.timeToFirstReview.p90Hours)} · ${data.data.timeToFirstReview.sample} PRs`}
            />
            <Stat label="Opened to merged" value={fmt(data.data.cycleTime.medianHours)} sub={`median · ${data.data.cycleTime.sample} merged`} />
            <Stat label="PRs opened" value={String(data.data.opened)} sub={`${data.data.unreviewed} still without a review`} />
            <Stat label="PRs merged" value={String(data.data.merged)} />
          </div>

          <section className="grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="mb-1 text-sm font-medium">Merged per week (12 weeks)</h2>
              <TrendChart
                rows={data.data.trend.map((w) => ({ label: w.week.slice(5), value: w.merged }))}
                label="PRs merged"
                ariaLabel="Line chart of pull requests merged per week over the last 12 weeks"
              />
            </div>
            <div>
              <h2 className="mb-1 text-sm font-medium">Time to first review per week</h2>
              <TrendChart
                rows={data.data.trend.map((w) => ({ label: w.week.slice(5), value: w.medianHoursToFirstReview }))}
                label="Median hours"
                format={(v) => fmt(v)}
                color="#0d9488"
                ariaLabel="Line chart of median hours to first review per week over the last 12 weeks"
              />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium">PR size (opened)</h2>
            <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
              {(["S", "M", "L"] as const).map((k, i) => (
                <div
                  key={k}
                  className={["bg-emerald-600", "bg-amber-500", "bg-red-500"][i]}
                  style={{ width: `${(data.data.sizes[k] / Math.max(1, data.data.opened)) * 100}%` }}
                />
              ))}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Small (&lt;100 lines) {data.data.sizes.S} · Medium {data.data.sizes.M} · Large (500+) {data.data.sizes.L}
            </p>
          </section>

          {data.data.repos.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium">Slowest repositories to first review</h2>
              <RankedBars
                rows={data.data.repos.map((r) => ({ name: r.repo, value: r.medianHoursToFirstReview ?? 0, note: `${r.prs} PRs` }))}
                label="Median hours to first review"
                format={(v) => fmt(v)}
                ariaLabel="Bar chart of repositories ranked by median hours to first review"
              />
            </section>
          )}

          {data.data.reviewers && (
            <section>
              <h2 className="mb-1 text-sm font-medium">Time from PR opened to each person&apos;s first review</h2>
              <p className="text-muted-foreground mb-2 text-xs">
                Visible to owners and admins only. Use it to rebalance load, not to rank people.
              </p>
              <RankedBars
                rows={data.data.reviewers.map((r) => ({ name: r.login, value: r.medianHoursToReview ?? 0, note: `${r.reviews} reviews` }))}
                label="Median hours to their first review"
                format={(v) => fmt(v)}
                color="#7c3aed"
                ariaLabel="Bar chart of reviewers ranked by median hours from PR opened to their first review"
              />
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Content() {
  const { workspace, isPending } = useWorkspace()
  if (isPending) return null
  if (!workspace) return <p className="text-muted-foreground text-sm">You aren&apos;t in a workspace yet.</p>
  return <Insights workspaceId={workspace.id} />
}

export default function Page() {
  return (
    <AppShell title="Insights">
      <Content />
    </AppShell>
  )
}
