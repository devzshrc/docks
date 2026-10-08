"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { QueryError } from "@/components/query-state"
import { AppShell } from "@/components/app-shell"
import { Skeleton } from "@/components/ui/skeleton"
import { Frame, FramePanel } from "@/components/reui/frame"
import { Timeline, TimelineContent, TimelineDate, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle } from "@/components/reui/timeline"
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

  if (log.error) return <QueryError error={log.error} onRetry={() => void log.refetch()} />
  const actions = [...new Set((log.data ?? []).map((e) => e.action))].sort()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Filter by action"
          className="bg-background hover:bg-muted h-8 rounded-lg border px-2 text-sm shadow-xs"
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
          className="bg-background hover:bg-muted h-8 rounded-lg border px-2 text-sm shadow-xs"
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
        <Frame spacing="sm">
          <FramePanel className="px-6 py-5">
            <Timeline value={log.data.length}>
              {log.data.map((e, i) => (
                <TimelineItem key={e.id} step={i + 1} className="group-data-[orientation=vertical]/timeline:ms-8 group-data-[orientation=vertical]/timeline:not-last:pb-6">
                  <TimelineHeader>
                    <TimelineSeparator className="group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:h-[calc(100%-1rem-0.25rem)] group-data-[orientation=vertical]/timeline:translate-y-5" />
                    <TimelineDate className="mb-1 text-xs">{new Date(e.at).toLocaleString()}</TimelineDate>
                    <TimelineTitle>
                      {e.actorName ?? "Removed user"} <span className="text-muted-foreground font-normal">·</span>{" "}
                      <span className="font-mono text-xs font-normal">{e.action}</span>
                    </TimelineTitle>
                    <TimelineIndicator className="group-data-[orientation=vertical]/timeline:-left-6 size-3 border-2" />
                  </TimelineHeader>
                  {(e.target || e.meta != null) && (
                    <TimelineContent className="mt-1 space-y-0.5 font-mono text-xs">
                      {e.target && <p>{members.data?.find((m) => m.userId === e.target)?.name ?? e.target}</p>}
                      {e.meta != null && <p className="text-text-3 break-all">{JSON.stringify(e.meta)}</p>}
                    </TimelineContent>
                  )}
                </TimelineItem>
              ))}
            </Timeline>
          </FramePanel>
        </Frame>
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
