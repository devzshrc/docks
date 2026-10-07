"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { toast } from "@/components/toast"
import { useTRPC } from "@/trpc/react"

/** Edits and bulk actions that refresh every issue view and tell the person what happened. */
export function useIssueActions() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries(trpc.issues.list.queryFilter())
    void queryClient.invalidateQueries(trpc.issues.counts.queryFilter())
    void queryClient.invalidateQueries(trpc.issues.board.queryFilter())
    void queryClient.invalidateQueries(trpc.issues.insights.queryFilter())
    void queryClient.invalidateQueries(trpc.issues.get.queryFilter())
    void queryClient.invalidateQueries(trpc.issues.facets.queryFilter())
  }
  const update = useMutation(
    trpc.issues.update.mutationOptions({
      onSuccess: refresh,
      onError: (e) => toast(e.message, "error"),
    }),
  )
  const bulk = useMutation(
    trpc.issues.bulk.mutationOptions({
      onSuccess: ({ results }) => {
        const failed = results.filter((r) => !r.ok)
        const ok = results.length - failed.length
        if (ok) toast(`Updated ${ok} issue${ok === 1 ? "" : "s"}`)
        if (failed.length) toast(`${failed.length} failed: ${failed[0]!.error ?? "unknown error"}`, "error")
        refresh()
      },
      onError: (e) => toast(e.message, "error"),
    }),
  )
  return { update, bulk, refresh }
}
