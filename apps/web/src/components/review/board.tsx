"use client"

import type { BoardCard as BoardCardData } from "@docks/api"
import { useEffect, useRef } from "react"

import { BoardCard } from "@/components/review/board-card"
import { Skeleton } from "@/components/ui/skeleton"

const LANES = [
  { id: "needs_reviewer", title: "Needs reviewer" },
  { id: "waiting", title: "Waiting on review" },
  { id: "changes_requested", title: "Changes requested" },
  { id: "approved", title: "Approved" },
] as const

/** Lanes by review state (plus Drafts when shown), with j/k keyboard movement (§5.2, M5). */
export function ReviewBoard({
  cards,
  loading,
  showDrafts,
  stuckHours,
  canAct,
}: {
  cards: BoardCardData[] | undefined
  loading: boolean
  showDrafts: boolean
  stuckHours: number
  canAct: boolean
}) {
  const root = useRef<HTMLDivElement>(null)

  // j / k move between cards in reading order; Enter follows the focused link.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (e.key !== "j" && e.key !== "k") return
      const links = [...(root.current?.querySelectorAll<HTMLAnchorElement>("a[data-card]") ?? [])]
      if (!links.length) return
      const i = links.indexOf(document.activeElement as HTMLAnchorElement)
      const next = e.key === "j" ? Math.min(i + 1, links.length - 1) : Math.max(i - 1, 0)
      links[i === -1 ? 0 : next]!.focus()
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const stuck = cards?.filter((c) => c.stuck).length ?? 0
  const lanes = [
    ...(showDrafts ? [{ id: "draft", title: "Drafts" } as const] : []),
    ...LANES,
  ]
  const inLane = (id: string) =>
    (cards ?? []).filter((c) => (id === "draft" ? c.draft : !c.draft && c.column === id))

  return (
    <div ref={root} className="space-y-3">
      {stuck > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {stuck} PR{stuck > 1 ? "s" : ""} waiting more than {stuckHours}h
        </p>
      )}
      <div
        className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:overflow-visible md:px-0"
        style={{ gridTemplateColumns: `repeat(${lanes.length}, minmax(0, 1fr))` }}
      >
        {lanes.map((lane) => {
          const items = inLane(lane.id)
          return (
            <section key={lane.id} className="bg-muted/50 w-[80vw] max-w-sm shrink-0 snap-start rounded-xl p-3 md:w-auto md:max-w-none">
              <h2 className="text-muted-foreground mb-2 flex justify-between text-sm font-medium">
                {lane.title}
                <span>{cards ? items.length : ""}</span>
              </h2>
              {loading ? (
                <Skeleton className="h-20 w-full" />
              ) : items.length === 0 ? (
                <p className="text-muted-foreground px-1 py-4 text-center text-xs">Nothing here</p>
              ) : (
                <div className="space-y-2">
                  {items.map((pr) => (
                    <BoardCard key={`${pr.repo}#${pr.number}`} pr={pr} canAct={canAct} />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
