"use client"

import type { BlameRange } from "@docks/api"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

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
  // Fixed to the viewport so the diff's scroll container can't clip it; placed on hover/focus.
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  if (!isPending && !ranges) return <>{children}</>
  const show = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    setAt({ x: Math.min(rect.left, window.innerWidth - 272), y: rect.top })
  }
  return (
    <span
      className="relative inline-block"
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setAt(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setAt(null)}
    >
      <span className="cursor-default underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
        {children}
      </span>
      <span
        role="tooltip"
        style={at ? { left: at.x, top: at.y - 6 } : undefined}
        className={`fixed z-50 w-64 -translate-y-full rounded-md border bg-popover p-2 text-left font-sans text-xs shadow-overlay ${at ? "block" : "hidden"}`}
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
                className="block truncate text-primary-text hover:underline"
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
