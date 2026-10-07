"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { AppShell } from "@/components/app-shell"
import { Skeleton } from "@/components/ui/skeleton"
import { useWorkspace } from "@/hooks/use-workspace"
import { useTRPC } from "@/trpc/react"

const SELECT = "border-input bg-background h-9 rounded-md border px-2 text-sm"
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

/** Inline SVG line; no chart library (plan M7). */
function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const nums = values.map((v) => v ?? 0)
  const max = Math.max(1, ...nums)
  const pts = nums.map((v, i) => `${(i / Math.max(1, nums.length - 1)) * 100},${30 - (v / max) * 28}`).join(" ")
  return (
    <svg viewBox="0 0 100 32" className="h-10 w-full" role="img" aria-label={label} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="text-emerald-600" />
    </svg>
  )
}

function Bars({ rows }: { rows: { label: string; value: number | null; note?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0))
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5rem] items-center gap-3 text-sm">
          <span className="truncate font-mono text-xs" title={r.label}>
            {r.label}
          </span>
          <div className="bg-muted h-2 rounded-full" aria-hidden>
            <div className="h-2 rounded-full bg-sky-600" style={{ width: `${((r.value ?? 0) / max) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums">
            {fmt(r.value)}
            {r.note && <span className="text-muted-foreground text-xs"> {r.note}</span>}
          </span>
        </li>
      ))}
    </ul>
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
              <Sparkline values={data.data.trend.map((w) => w.merged)} label="Merged pull requests per week" />
              <p className="text-muted-foreground text-xs">
                {data.data.trend.map((w) => w.merged).join(" · ")}
              </p>
            </div>
            <div>
              <h2 className="mb-1 text-sm font-medium">Time to first review per week</h2>
              <Sparkline values={data.data.trend.map((w) => w.medianHoursToFirstReview)} label="Median hours to first review per week" />
              <p className="text-muted-foreground text-xs">
                {data.data.trend.map((w) => fmt(w.medianHoursToFirstReview)).join(" · ")}
              </p>
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
              <Bars rows={data.data.repos.map((r) => ({ label: r.repo, value: r.medianHoursToFirstReview, note: `· ${r.prs}` }))} />
            </section>
          )}

          {data.data.reviewers && (
            <section>
              <h2 className="mb-1 text-sm font-medium">Time from PR opened to each person&apos;s first review</h2>
              <p className="text-muted-foreground mb-2 text-xs">
                Visible to owners and admins only. Use it to rebalance load, not to rank people.
              </p>
              <Bars rows={data.data.reviewers.map((r) => ({ label: r.login, value: r.medianHoursToReview, note: `· ${r.reviews}` }))} />
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
