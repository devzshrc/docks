import type { IssueItem } from "@/components/issues/shared"

export interface IssuePatch {
  title?: string
  assignees?: string[]
  labels?: string[]
  state?: "open" | "closed"
  stateReason?: "completed" | "not_planned" | "duplicate"
}

/** What an edit will look like once GitHub accepts it. Works on list rows and the detail view alike. */
export function applyPatch<T extends Pick<IssueItem, "title" | "assignees" | "labels" | "state" | "stateReason">>(i: T, p: IssuePatch): T {
  return {
    ...i,
    ...(p.title !== undefined && { title: p.title }),
    ...(p.assignees && { assignees: p.assignees }),
    ...(p.labels && { labels: p.labels.map((name) => i.labels.find((l) => l.name === name) ?? { name, color: "888888" }) }),
    ...(p.state && { state: p.state, stateReason: p.state === "open" ? null : (p.stateReason ?? "completed") }),
  }
}

export type BulkAction = { type: "close"; reason?: "completed" | "not_planned" } | { type: "reopen" } | { type: "label"; label: string } | { type: "assign"; login: string }

export function bulkPatch(i: Pick<IssueItem, "assignees" | "labels">, a: BulkAction): IssuePatch {
  switch (a.type) {
    case "close":
      return { state: "closed", stateReason: a.reason ?? "completed" }
    case "reopen":
      return { state: "open" }
    case "label":
      return { labels: [...new Set([...i.labels.map((l) => l.name), a.label])] }
    case "assign":
      return { assignees: [...new Set([...i.assignees, a.login])] }
  }
}

/** Does an edited row still belong in the list it is shown in? */
export function stillListed(i: Pick<IssueItem, "state" | "assignees">, f: { state?: string; assignee?: string } | undefined) {
  if (f?.state && f.state !== "all" && i.state !== f.state) return false
  if (f?.assignee === "none" && i.assignees.length > 0) return false
  return true
}
