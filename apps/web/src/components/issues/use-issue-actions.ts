"use client"

import { useMutation, useQueryClient, type QueryFilters } from "@tanstack/react-query"

import { applyPatch, bulkPatch, stillListed, type BulkAction, type IssuePatch } from "@/components/issues/patch"
import type { Outputs } from "@/components/issues/shared"
import { toast } from "@/components/toast"
import { inputOf, optimistic } from "@/lib/optimistic"
import { useTRPC } from "@/trpc/react"

type List = Outputs["issues"]["list"]
type ListInput = { filters?: { state?: string; assignee?: string } }
type UpdateVars = { repo: string; number: number; patch: IssuePatch }
type BulkVars = { items: { repo: string; number: number }[]; action: BulkAction }

/** Edits and bulk actions: the list and the detail page change at once, then reconcile with GitHub. */
export function useIssueActions() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const refresh = () => {
    const filters: QueryFilters[] = [
      trpc.issues.list.queryFilter(),
      trpc.issues.counts.queryFilter(),
      trpc.issues.board.queryFilter(),
      trpc.issues.insights.queryFilter(),
      trpc.issues.get.queryFilter(),
      trpc.issues.facets.queryFilter(),
    ]
    for (const f of filters) void queryClient.invalidateQueries(f)
  }

  /** Apply `change` to the matching rows of every cached list, dropping rows that no longer fit it. */
  const onLists = <V,>(change: (row: List["items"][number], vars: V) => List["items"][number] | undefined) => ({
    filter: trpc.issues.list.queryFilter(),
    patch: (data: List, vars: V, key: readonly unknown[]) => {
      const f = inputOf<ListInput>(key as never)?.filters
      let touched = false
      const items = data.items.flatMap((row) => {
        const next = change(row, vars)
        if (!next) return [row]
        touched = true
        return stillListed(next, f) ? [next] : []
      })
      return touched ? { ...data, items, total: data.total - (data.items.length - items.length) } : undefined
    },
  })

  const update = useMutation(
    trpc.issues.update.mutationOptions({
      ...optimistic<UpdateVars>(
        queryClient,
        [
          onLists<UpdateVars>((row, v) => (row.repo === v.repo && row.number === v.number ? applyPatch(row, v.patch) : undefined)),
          {
            filter: trpc.issues.get.queryFilter(),
            patch: (data: Outputs["issues"]["get"], v: UpdateVars) => (data.repo === v.repo && data.number === v.number ? applyPatch(data, v.patch) : undefined),
          },
        ],
        { settled: refresh },
      ),
    }),
  )

  const bulk = useMutation(
    trpc.issues.bulk.mutationOptions({
      ...optimistic<BulkVars>(
        queryClient,
        [onLists<BulkVars>((row, v) => (v.items.some((i) => i.repo === row.repo && i.number === row.number) ? applyPatch(row, bulkPatch(row, v.action)) : undefined))],
        { settled: refresh, toastError: true },
      ),
      onSuccess: ({ results }) => {
        const failed = results.filter((r) => !r.ok)
        const ok = results.length - failed.length
        if (ok) toast(`Updated ${ok} issue${ok === 1 ? "" : "s"}`)
        if (failed.length) toast(`${failed.length} failed: ${failed[0]!.error ?? "unknown error"}`, "error")
      },
    }),
  )
  return { update, bulk, refresh }
}
