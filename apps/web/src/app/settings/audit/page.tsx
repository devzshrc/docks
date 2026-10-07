"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { AppShell } from "@/components/app-shell"
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

function Log({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC()
  const [action, setAction] = useState("")
  const [actorId, setActorId] = useState("")
  const log = useQuery(
    trpc.workspace.auditLog.queryOptions({
      workspaceId,
      action: action || undefined,
      actorId: actorId || undefined,
    })
  )
  const members = useQuery(trpc.workspace.members.queryOptions({ workspaceId }))

  if (log.error) return <p className="text-destructive text-sm">{log.error.message}</p>
  const actions = [...new Set((log.data ?? []).map((e) => e.action))].sort()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Filter by action"
          className="border-input bg-background h-9 rounded-lg border px-2 text-sm"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">All actions</option>
          {(action ? [action, ...actions.filter((a) => a !== action)] : actions).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by person"
          className="border-input bg-background h-9 rounded-lg border px-2 text-sm"
          value={actorId}
          onChange={(e) => setActorId(e.target.value)}
        >
          <option value="">Everyone</option>
          {members.data?.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      {log.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : log.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.data.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(e.at).toLocaleString()}
                  </TableCell>
                  <TableCell>{e.actorName ?? "Removed user"}</TableCell>
                  <TableCell className="font-mono text-xs">{e.action}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {members.data?.find((m) => m.userId === e.target)?.name ?? e.target ?? ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {e.meta ? JSON.stringify(e.meta) : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function Content() {
  const { workspace, isPending } = useWorkspace()
  if (isPending) return null
  if (!workspace) return <p className="text-muted-foreground text-sm">You aren&apos;t in a workspace yet.</p>
  return <Log workspaceId={workspace.id} />
}

export default function Page() {
  return (
    <AppShell title="Audit log" description="Who changed what in this workspace, newest first.">
      <Content />
    </AppShell>
  )
}
