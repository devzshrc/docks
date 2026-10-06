"use client"

import { useQuery } from "@tanstack/react-query"

import { useTRPC } from "@/trpc/react"

/** v1: one workspace per user — the first one they belong to. */
export function useWorkspace() {
  const trpc = useTRPC()
  const list = useQuery(trpc.workspace.list.queryOptions())
  return { ...list, workspace: list.data?.[0] }
}

/** What the signed-in person may do in this workspace, decided by the server. */
export function useWorkspaceSettings(workspaceId: string | undefined) {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.workspace.settings.queryOptions({ workspaceId: workspaceId ?? "" }),
    enabled: Boolean(workspaceId),
  })
}
