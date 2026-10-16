"use client"

import type { RouterOutputs } from "@docks/api"
import { IconCircleCheck, IconCircleDot, IconCircleOff } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

export type Outputs = RouterOutputs
export type IssueItem = Outputs["issues"]["list"]["items"][number]
export type IssueStatus = IssueItem["status"]

export function age(iso: string | Date) {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hours < 1) return "just now"
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return days < 60 ? `${days}d` : `${Math.floor(days / 30)}mo`
}

export const STATUS_LABEL: Record<IssueStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
}

/** Open, closed as completed, or closed as not planned / duplicate. */
export function StateIcon({ state, reason, className }: { state: "open" | "closed"; reason?: string | null; className?: string }) {
  if (state === "open") return <IconCircleDot className={cn("size-4 text-emerald-600 dark:text-emerald-400", className)} aria-label="Open" />
  if (reason === "not_planned" || reason === "duplicate") return <IconCircleOff className={cn("text-text-3 size-4", className)} aria-label="Closed, not planned" />
  return <IconCircleCheck className={cn("size-4 text-violet-600 dark:text-violet-400", className)} aria-label="Closed" />
}

/** A GitHub label in its own colour, kept readable in both themes. */
export function LabelChip({ name, color }: { name: string; color: string }) {
  const c = /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : "#888888"
  return (
    <span
      className="inline-flex h-5 max-w-40 items-center truncate rounded border px-2 text-[11px] leading-none"
      style={{ borderColor: `color-mix(in oklch, ${c} 45%, transparent)`, backgroundColor: `color-mix(in oklch, ${c} 14%, transparent)` }}
    >
      {name}
    </span>
  )
}

export type View = "triage" | "open" | "mine" | "created" | "stale" | "closed" | "board" | "insights"
export type Sort = "updated" | "created" | "oldest" | "comments"

export const VIEWS: { id: View; label: string; count?: "triage" | "open" | "mine" | "created" | "stale" }[] = [
  { id: "triage", label: "Triage", count: "triage" },
  { id: "open", label: "Open", count: "open" },
  { id: "mine", label: "Assigned to me", count: "mine" },
  { id: "created", label: "Created by me", count: "created" },
  { id: "stale", label: "Stale", count: "stale" },
  { id: "closed", label: "Closed" },
  { id: "board", label: "Board" },
  { id: "insights", label: "Insights" },
]

export interface UiFilters {
  view: View
  repoId?: number
  assignee?: string
  label?: string
  milestone?: string
  q: string
  sort?: Sort
}

const IDS = new Set<string>(VIEWS.map((v) => v.id))

export function fromParams(p: URLSearchParams): UiFilters {
  const view = p.get("view") ?? "triage"
  const repo = Number(p.get("repo"))
  const sort = p.get("sort")
  return {
    view: IDS.has(view) ? (view as View) : "triage",
    repoId: Number.isInteger(repo) && repo > 0 ? repo : undefined,
    assignee: p.get("assignee") || undefined,
    label: p.get("label") || undefined,
    milestone: p.get("milestone") || undefined,
    q: p.get("q") ?? "",
    sort: sort === "updated" || sort === "created" || sort === "oldest" || sort === "comments" ? sort : undefined,
  }
}

export function toParams(f: UiFilters): string {
  const p = new URLSearchParams()
  if (f.view !== "triage") p.set("view", f.view)
  if (f.repoId) p.set("repo", String(f.repoId))
  if (f.assignee) p.set("assignee", f.assignee)
  if (f.label) p.set("label", f.label)
  if (f.milestone) p.set("milestone", f.milestone)
  if (f.q) p.set("q", f.q)
  if (f.sort) p.set("sort", f.sort)
  return p.toString()
}

/** What each view asks the server for; the toolbar filters narrow it further. */
export function serverFilters(f: UiFilters) {
  const base: { state: "open" | "closed" | "all"; sort: Sort; assignee?: string; author?: string; stale?: boolean } = { state: "open", sort: "updated" }
  switch (f.view) {
    case "triage":
      base.assignee = "none"
      base.sort = "created"
      break
    case "mine":
      base.assignee = "me"
      break
    case "created":
      base.author = "me"
      break
    case "stale":
      base.stale = true
      base.sort = "oldest"
      break
    case "closed":
      base.state = "closed"
      break
  }
  return {
    ...base,
    assignee: base.assignee ?? f.assignee,
    sort: f.sort ?? base.sort,
    repoIds: f.repoId ? [f.repoId] : undefined,
    label: f.label,
    milestone: f.milestone,
    q: f.q.trim() || undefined,
  }
}
