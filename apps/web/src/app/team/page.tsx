"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"

import { PersonAvatar } from "@/components/person-avatar"
import { Panel } from "@/components/panel"
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
    <li className="row-hover grid min-h-14 grid-cols-[minmax(0,12rem)_minmax(0,1fr)_6rem_7rem] items-center gap-4 rounded-lg px-4 py-2 text-sm">
      <Link href={`/people/${p.userId}`} className="flex min-w-0 items-center gap-2.5 font-medium hover:underline">
        <PersonAvatar seed={p.userId} name={p.name} githubLogin={p.githubLogin} />
        <span className="truncate">{p.name}</span>
      </Link>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
        <div className={p.overLimit ? "bg-warning h-1.5 rounded-full transition-[width] duration-500" : "bg-primary h-1.5 rounded-full transition-[width] duration-500"} style={{ width: `${width}%` }} />
      </div>
      <span className="text-right tabular-nums">
        {p.openReviews}
        {p.maxOpenReviews ? <span className="text-text-3"> / {p.maxOpenReviews}</span> : ""}
        <span className="text-muted-foreground"> open</span>
      </span>
      <span className="text-muted-foreground flex justify-end gap-1 text-xs">
        {p.away && <span className="pill">away until {p.awayUntil}</span>}
        {!p.githubLogin && <span className="pill">no GitHub</span>}
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
    <div className="space-y-6">
      {groups.map((g) => (
        <Panel key={g.name} title={g.name} description={`${g.people.length} ${g.people.length === 1 ? "person" : "people"}`} bodyClassName="p-2">
          <ul className="stagger">
            {[...g.people]
              .sort((a, b) => b.openReviews - a.openReviews)
              .map((p) => (
                <LoadRow key={p.userId} p={p} max={max} />
              ))}
          </ul>
        </Panel>
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
