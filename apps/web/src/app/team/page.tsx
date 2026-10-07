"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"

import { QueryError } from "@/components/query-state"
import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useWorkspace } from "@/hooks/use-workspace"
import { useTRPC } from "@/trpc/react"

type Person = {
  userId: string
  name: string
  githubLogin: string | null
  away: boolean
  awayUntil: string | null
  openReviews: number
  maxOpenReviews: number | null
  oldestWaitingSince: Date | string | null
  overLimit: boolean
  teams: { id: string; name: string }[]
}

function waited(d: Date | string | null) {
  if (!d) return ""
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3_600_000)
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`
}

function LoadRow({ p, max }: { p: Person; max: number }) {
  const width = max ? (p.openReviews / max) * 100 : 0
  return (
    <li className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 py-2 text-sm">
      <Link href={`/people/${p.userId}`} className="truncate hover:underline">
        {p.name}
      </Link>
      <div className="flex items-center gap-2">
        <div className="bg-muted h-2 flex-1 rounded-full" aria-hidden>
          <div
            className={p.overLimit ? "h-2 rounded-full bg-amber-500" : "h-2 rounded-full bg-emerald-600"}
            style={{ width: `${width}%` }}
          />
        </div>
        <span className="w-24 text-right tabular-nums">
          {p.openReviews}
          {p.maxOpenReviews ? ` / ${p.maxOpenReviews}` : ""} open
        </span>
      </div>
      <span className="text-muted-foreground flex w-40 justify-end gap-1 text-xs">
        {p.away && <Badge variant="secondary">away until {p.awayUntil}</Badge>}
        {!p.githubLogin && <Badge variant="outline">no GitHub</Badge>}
        {p.oldestWaitingSince && p.openReviews > 0 && `oldest ${waited(p.oldestWaitingSince)}`}
      </span>
    </li>
  )
}

function Load({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC()
  const people = useQuery(trpc.people.list.queryOptions({ workspaceId }))
  const teams = useQuery(trpc.people.teams.queryOptions({ workspaceId }))
  if (people.isPending || teams.isPending) return <Skeleton className="h-48 w-full max-w-3xl" />
  if (people.error) return <QueryError error={people.error} onRetry={() => void people.refetch()} />

  const all = people.data.filter((p) => p.role !== "viewer") as Person[]
  const max = Math.max(1, ...all.map((p) => p.openReviews))
  const groups = [
    ...(teams.data ?? []).map((t) => ({ name: t.name, people: all.filter((p) => t.userIds.includes(p.userId)) })),
    { name: "Not on a team", people: all.filter((p) => p.teams.length === 0) },
  ].filter((g) => g.people.length)

  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.name}>
          <h2 className="mb-1 text-sm font-medium">{g.name}</h2>
          <ul className="divide-y">
            {[...g.people]
              .sort((a, b) => b.openReviews - a.openReviews)
              .map((p) => (
                <LoadRow key={p.userId} p={p} max={max} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Content() {
  const { workspace, isPending } = useWorkspace()
  if (isPending) return null
  if (!workspace) return <p className="text-muted-foreground text-sm">You aren&apos;t in a workspace yet.</p>
  return <Load workspaceId={workspace.id} />
}

export default function Page() {
  return (
    <AppShell title="Team" description="Open review requests per person. Amber means someone has reached their limit.">
      <Content />
    </AppShell>
  )
}
