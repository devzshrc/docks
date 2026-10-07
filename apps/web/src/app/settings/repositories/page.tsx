"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"

import { optimistic } from "@/lib/optimistic"
import { QueryError } from "@/components/query-state"
import { AppShell } from "@/components/app-shell"
import { RulesEditor } from "@/components/rules-editor"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useWorkspace } from "@/hooks/use-workspace"
import { useTRPC } from "@/trpc/react"

function Repositories({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const repos = useQuery(trpc.workspace.repos.queryOptions({ workspaceId }))
  const setRepo = useMutation(
    trpc.workspace.setRepo.mutationOptions({
      meta: { toast: "Saved" },
      ...optimistic<{ repoId: number; enabled?: boolean; aiEnabled?: boolean; autoAssign?: number }>(queryClient, [
        {
          filter: trpc.workspace.repos.queryFilter(),
          patch: (rows: { id: number }[], { repoId, ...change }) => rows.map((r) => (r.id === repoId ? { ...r, ...change } : r)),
        },
      ]),
    })
  )

  if (repos.isPending) return <Skeleton className="h-24 w-full" />
  if (repos.error) return <QueryError error={repos.error} onRetry={() => void repos.refetch()} />
  if (!repos.data.length) {
    return (
      <p className="text-muted-foreground text-sm">
        No repositories yet.{" "}
        <Link href="/settings/integrations" className="underline">
          Install the GitHub App
        </Link>{" "}
        to add some.
      </p>
    )
  }

  return (
    <div className="space-y-2">
    {setRepo.error && <p className="text-destructive text-sm">{setRepo.error.message}</p>}
    <div className="bg-card border-hairline overflow-hidden rounded-xl border">
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Repository</TableHead>
          <TableHead className="w-28">Enabled</TableHead>
          <TableHead className="w-28">AI guide</TableHead>
          <TableHead className="w-40">Auto-assign</TableHead>
          <TableHead>Review checklist</TableHead>
          <TableHead className="w-28">Rules</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {repos.data.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">
              {r.fullName}
              {r.suspended && (
                <Badge variant="destructive" className="ml-2">
                  suspended
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <input
                type="checkbox"
                className="size-4"
                aria-label={`Enable ${r.fullName}`}
                checked={r.enabled}
                onChange={(e) => setRepo.mutate({ repoId: r.id, enabled: e.target.checked })}
              />
            </TableCell>
            <TableCell>
              <input
                type="checkbox"
                className="size-4"
                aria-label={`AI guide for ${r.fullName}`}
                checked={r.aiEnabled}
                onChange={(e) => setRepo.mutate({ repoId: r.id, aiEnabled: e.target.checked })}
              />
            </TableCell>
            <TableCell>
              <select
                className="border-input bg-background h-8 rounded-lg border px-2 text-sm"
                aria-label={`Auto-assign reviewers for ${r.fullName}`}
                value={r.autoAssign}
                onChange={(e) => setRepo.mutate({ repoId: r.id, autoAssign: Number(e.target.value) })}
              >
                <option value={0}>Off</option>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n} reviewer{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </TableCell>
            <TableCell>
              <textarea
                className="border-input bg-background w-64 rounded-md border px-2 py-1 text-xs"
                rows={2}
                aria-label={`Review checklist for ${r.fullName}, one question per line`}
                placeholder="One question per line, shown on every PR"
                defaultValue={r.checklistTemplate.join("\n")}
                onBlur={(e) => {
                  const next = e.target.value.split("\n").map((l) => l.trim()).filter(Boolean)
                  if (next.join("\n") !== r.checklistTemplate.join("\n")) {
                    setRepo.mutate({ repoId: r.id, checklistTemplate: next })
                  }
                }}
              />
            </TableCell>
            <TableCell>
              <RulesEditor workspaceId={workspaceId} repo={r} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
    </div>
    </div>
  )
}

function Content() {
  const { workspace, isPending } = useWorkspace()
  if (isPending) return null
  if (!workspace) {
    return (
      <p className="text-muted-foreground text-sm">
        <Link href="/settings/integrations" className="underline">
          Create a workspace
        </Link>{" "}
        first.
      </p>
    )
  }
  return <Repositories workspaceId={workspace.id} />
}

export default function Page() {
  return (
    <AppShell title="Repositories" description="Choose which repositories appear on the board and how their pull requests are reviewed.">
      <Content />
    </AppShell>
  )
}
