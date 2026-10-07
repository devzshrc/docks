"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"

import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useWorkspace } from "@/hooks/use-workspace"
import { useTRPC } from "@/trpc/react"

function ago(d: Date | string) {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3_600_000)
  return h < 24 ? `${Math.max(h, 0)}h` : `${Math.floor(h / 24)}d`
}

function EditProfile({
  workspaceId,
  userId,
  awayUntil,
  expertise,
  maxOpenReviews,
}: {
  workspaceId: string
  userId: string
  awayUntil: string | null
  expertise: string[]
  maxOpenReviews: number | null
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [away, setAway] = useState(awayUntil ?? "")
  const [tags, setTags] = useState(expertise.join(", "))
  const [limit, setLimit] = useState(maxOpenReviews?.toString() ?? "")
  useEffect(() => {
    setAway(awayUntil ?? "")
    setTags(expertise.join(", "))
    setLimit(maxOpenReviews?.toString() ?? "")
  }, [awayUntil, expertise, maxOpenReviews])
  const save = useMutation(
    trpc.people.updateMember.mutationOptions({
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries(trpc.people.person.queryFilter()),
          queryClient.invalidateQueries(trpc.people.list.queryFilter()),
        ]),
    })
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Availability and expertise</CardTitle>
        <CardDescription>Used to suggest reviewers and skip people who are away.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid max-w-lg gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate({
              workspaceId,
              userId,
              awayUntil: away || null,
              expertise: tags.split(",").map((t) => t.trim()).filter(Boolean),
              maxOpenReviews: limit ? Number(limit) : null,
            })
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="away">Away until</Label>
            <div className="flex gap-2">
              <Input id="away" type="date" value={away} onChange={(e) => setAway(e.target.value)} className="w-48" />
              {away && (
                <Button type="button" variant="ghost" onClick={() => setAway("")}>
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tags">Expertise</Label>
            <Input id="tags" placeholder="payments, db, auth" value={tags} onChange={(e) => setTags(e.target.value)} />
            <p className="text-muted-foreground text-xs">Comma-separated. Matched against folder and file names in PRs.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="limit">Most open reviews at once</Label>
            <Input
              id="limit"
              type="number"
              min={1}
              max={50}
              placeholder="No limit"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="w-32"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
            {save.isSuccess && <span className="text-sm text-emerald-600">Saved</span>}
            {save.error && <span className="text-destructive text-sm">{save.error.message}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function PrList({
  title,
  empty,
  rows,
  detail,
}: {
  title: string
  empty: string
  rows: { repo: string; number: number; title: string }[]
  detail: (r: never) => React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <ul className="divide-y text-sm">
            {rows.map((r) => (
              <li key={`${r.repo}#${r.number}`} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/review/${r.repo}/${r.number}`} className="min-w-0 truncate hover:underline">
                  <span className="text-muted-foreground">
                    {r.repo}#{r.number}
                  </span>{" "}
                  {r.title}
                </Link>
                <span className="text-muted-foreground shrink-0 text-xs">{detail(r as never)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Person({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const trpc = useTRPC()
  const person = useQuery(trpc.people.person.queryOptions({ workspaceId, userId }))
  if (person.isPending) return <Skeleton className="h-48 w-full max-w-3xl" />
  if (person.error) return <p className="text-destructive text-sm">{person.error.message}</p>
  const p = person.data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {p.githubLogin && (
          <img src={`https://github.com/${p.githubLogin}.png?size=80`} alt="" className="size-12 rounded-full" />
        )}
        <div>
          <h2 className="text-xl font-medium">{p.name}</h2>
          <p className="text-muted-foreground text-sm">
            {p.githubLogin ? `@${p.githubLogin}` : "GitHub not connected"}
            {p.email && ` · ${p.email}`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="capitalize">
          {p.role}
        </Badge>
        {p.away && <Badge variant="secondary">Away until {p.awayUntil}</Badge>}
        {p.teams.map((t) => (
          <Badge key={t.id} variant="outline">
            {t.name}
          </Badge>
        ))}
        {p.expertise.map((x) => (
          <Badge key={x} variant="secondary">
            {x}
          </Badge>
        ))}
      </div>
      <PrList
        title={`Waiting on ${p.name.split(" ")[0]} (${p.waitingOnThem.length}${p.maxOpenReviews ? ` of ${p.maxOpenReviews}` : ""})`}
        empty="No open review requests."
        rows={p.waitingOnThem}
        detail={(r: { since: string }) => `waiting ${ago(r.since)}`}
      />
      <PrList
        title="Recent reviews"
        empty="No reviews yet."
        rows={p.recentReviews}
        detail={(r: { state: string; at: string }) => `${r.state.replace("_", " ").toLowerCase()} · ${ago(r.at)} ago`}
      />
      <PrList title="Pull requests" empty="No pull requests yet." rows={p.authored} detail={(r: { state: string }) => r.state} />
      {p.canEdit && (
        <EditProfile
          workspaceId={workspaceId}
          userId={userId}
          awayUntil={p.awayUntil}
          expertise={p.expertise}
          maxOpenReviews={p.maxOpenReviews}
        />
      )}
    </div>
  )
}

function Content() {
  const { userId } = useParams<{ userId: string }>()
  const { workspace, isPending } = useWorkspace()
  if (isPending) return null
  if (!workspace) return <p className="text-muted-foreground text-sm">You aren&apos;t in a workspace yet.</p>
  return <Person workspaceId={workspace.id} userId={userId} />
}

export default function Page() {
  return (
    <AppShell width="narrow">
      <Content />
    </AppShell>
  )
}
