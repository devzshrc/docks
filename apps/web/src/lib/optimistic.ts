import type { QueryClient, QueryFilters, QueryKey } from "@tanstack/react-query"

import { toast } from "@/components/toast"

/** Patch for the cached data of every query a filter matches; return undefined to leave one alone. */
export interface Target<V> {
  filter: QueryFilters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch: (data: any, vars: V, key: QueryKey) => unknown
}

type Snapshot = [QueryKey, unknown][]

/**
 * Makes a mutation look instant: patches the cached queries first, puts them back if the server
 * says no, and refetches either way so the cache ends up as the server's truth.
 * Spread the result into `mutationOptions({ ...optimistic(...), onSuccess })`.
 */
export function optimistic<V>(qc: QueryClient, targets: Target<V>[], opts: { toastError?: boolean; settled?: () => void; onError?: (e: { message: string }) => void } = {}) {
  return {
    onMutate: async (vars: V) => {
      const snapshot: Snapshot = []
      for (const t of targets) {
        await qc.cancelQueries(t.filter)
        for (const [key, data] of qc.getQueriesData(t.filter)) {
          if (data === undefined) continue
          const next = t.patch(data, vars, key)
          if (next === undefined) continue
          snapshot.push([key, data])
          qc.setQueryData(key, next)
        }
      }
      return { snapshot }
    },
    onError: (e: { message: string }, _vars: V, ctx?: { snapshot: Snapshot }) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
      if (opts.onError) opts.onError(e)
      else if (opts.toastError !== false) toast(e.message, "error")
    },
    onSettled: () => {
      if (opts.settled) opts.settled()
      else targets.forEach((t) => void qc.invalidateQueries(t.filter))
    },
  }
}

/** The `input` a tRPC query was called with, read from its cache key. */
export const inputOf = <T>(key: QueryKey) => (key[1] as { input?: T } | undefined)?.input
