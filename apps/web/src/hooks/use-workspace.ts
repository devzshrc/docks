"use client"

import { useQuery } from "@tanstack/react-query"

import { useTRPC } from "@/trpc/react"

const SLOW = 5 * 60_000

/** v1: one workspace per user — the first one they belong to. */
export function useWorkspace() {
  const trpc = useTRPC()
  // The workspace and what you may do in it change rarely: don't refetch them on every page.
  const list = useQuery({ ...trpc.workspace.list.queryOptions(), staleTime: SLOW })
  return { ...list, workspace: list.data?.[0] }
}

/** What the signed-in person may do in this workspace, decided by the server. */
export function useWorkspaceSettings(workspaceId: string | undefined) {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.workspace.settings.queryOptions({ workspaceId: workspaceId ?? "" }),
    enabled: Boolean(workspaceId),
    staleTime: SLOW,
  })
}
