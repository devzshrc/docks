"use client"

import type { BlameRange } from "@docks/api"
import { useQuery } from "@tanstack/react-query"

import { Skeleton } from "@/components/ui/skeleton"
import { useTRPC } from "@/trpc/react"

function rangeFor(ranges: BlameRange[], line: number): BlameRange | null {
  let lo = 0
  let hi = ranges.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const r = ranges[mid]!
    if (line < r.start) hi = mid - 1
    else if (line > r.end) lo = mid + 1
    else return r
  }
  return null
}

/**
 * Blame for one file, fetched once when the diff opens. Old-side line numbers
 * refer to the merge base, which is what the server blames.
 */
export function useBlame(repo: string, number: number, path: string, enabled: boolean) {
  const trpc = useTRPC()
  const q = useQuery({ ...trpc.review.blame.queryOptions({ repo, number, path }), enabled, retry: false, staleTime: 10 * 60_000 })
  return q
}

/** Hover/focus target wrapping an old-side line number; shows who last touched the line. */
export function BlameLine({
  repo,
  number,
  path,
  line,
  ranges,
  isPending,
  children,
}: {
  repo: string
  number: number
  path: string
  line: number
  ranges: BlameRange[] | undefined
  isPending: boolean
  children: React.ReactNode
}) {
  const r = ranges ? rangeFor(ranges, line) : null
  return (
    <span className="group/blame relative inline-block">
      <span className="cursor-default underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
        {children}
      </span>
      <span
        role="tooltip"
        className="invisible absolute bottom-full left-1/2 z-20 mb-1 w-64 -translate-x-1/2 rounded-md border bg-popover p-2 text-left font-sans text-xs shadow-lg group-hover/blame:visible group-focus-within/blame:visible"
      >
        {isPending ? (
          <Skeleton className="h-8 w-full" />
        ) : !ranges ? (
          <span className="text-muted-foreground">Blame unavailable for this file.</span>
        ) : r ? (
          <span className="space-y-1">
            <span className="block font-medium">
              {r.author} <span className="font-mono font-normal text-muted-foreground">{r.oid}</span>
            </span>
            <span className="block truncate" title={r.headline}>
              {r.headline}
            </span>
            <span className="block text-muted-foreground">{new Date(r.date).toLocaleDateString()}</span>
            {r.pr && (
              <a
                href={r.pr.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                #{r.pr.number} {r.pr.title}
              </a>
            )}
            {r.end > r.start && (
              <span className="block text-muted-foreground">
                Lines {r.start}–{r.end}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">No blame for this line (added in this PR).</span>
        )}
      </span>
      <span className="sr-only">
        {r ? `Last changed by ${r.author} in ${r.oid}: ${r.headline}` : ""}
        <span className="hidden">
          {repo} {number} {path}
        </span>
      </span>
    </span>
  )
}
