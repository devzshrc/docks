"use client"

import { useQuery } from "@tanstack/react-query"

import { AppShell } from "@/components/app-shell"
import { QueryError } from "@/components/query-state"
import { TeamGrid, type TeamMember } from "@/components/team/team-grid"
import { Skeleton } from "@/components/ui/skeleton"
import { useWorkspace } from "@/hooks/use-workspace"
import { useTRPC } from "@/trpc/react"

function Load({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC()
  const people = useQuery(trpc.people.list.queryOptions({ workspaceId }))
  const teams = useQuery(trpc.people.teams.queryOptions({ workspaceId }))
  if (people.isPending || teams.isPending) return <Skeleton className="h-48 w-full max-w-3xl" />
  if (people.error) return <QueryError error={people.error} onRetry={() => void people.refetch()} />

  const all = people.data.filter((p) => p.role !== "viewer") as TeamMember[]
  const groups = [
    ...(teams.data ?? []).map((t) => ({ name: t.name, people: all.filter((p) => t.userIds.includes(p.userId)) })),
    { name: "Not on a team", people: all.filter((p) => p.teams.length === 0) },
  ].filter((g) => g.people.length)

  return (
    <div className="space-y-12">
      {groups.map((g) => (
        <section key={g.name} aria-label={g.name} className="space-y-6">
          <header className="flex items-baseline justify-between gap-3">
            <h2 className="text-foreground text-lg font-medium">{g.name}</h2>
            <span className="text-muted-foreground text-sm">{g.people.length === 1 ? "1 person" : `${g.people.length} people`}</span>
          </header>
          <TeamGrid people={[...g.people].sort((a, b) => b.openReviews - a.openReviews)} />
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
