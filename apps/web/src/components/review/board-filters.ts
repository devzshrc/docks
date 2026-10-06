/** Board filters <-> URL search params, so any view is a shareable link (plan M5). */
export type Sort = "oldest" | "biggest" | "risk"

export interface UiFilters {
  repoIds: number[]
  author?: string
  reviewer?: string
  teamId?: string
  label?: string
  size?: "S" | "M" | "L"
  mine: boolean
  waitingOnMe: boolean
  priority: boolean
  includeDrafts: boolean
  sort: Sort
  q: string // client-side title/number search
}

export function fromParams(p: URLSearchParams): UiFilters {
  const size = p.get("size")
  const sort = p.get("sort")
  return {
    repoIds: (p.get("repos") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n !== 0),
    author: p.get("author") ?? undefined,
    reviewer: p.get("reviewer") ?? undefined,
    teamId: p.get("team") ?? undefined,
    label: p.get("label") ?? undefined,
    size: size === "S" || size === "M" || size === "L" ? size : undefined,
    mine: p.get("mine") === "1",
    waitingOnMe: p.get("waiting") === "1",
    priority: p.get("priority") === "1",
    includeDrafts: p.get("drafts") === "1",
    sort: sort === "biggest" || sort === "risk" ? sort : "oldest",
    q: p.get("q") ?? "",
  }
}

export function toParams(f: UiFilters): string {
  const p = new URLSearchParams()
  if (f.repoIds.length) p.set("repos", f.repoIds.join(","))
  if (f.author) p.set("author", f.author)
  if (f.reviewer) p.set("reviewer", f.reviewer)
  if (f.teamId) p.set("team", f.teamId)
  if (f.label) p.set("label", f.label)
  if (f.size) p.set("size", f.size)
  if (f.mine) p.set("mine", "1")
  if (f.waitingOnMe) p.set("waiting", "1")
  if (f.priority) p.set("priority", "1")
  if (f.includeDrafts) p.set("drafts", "1")
  if (f.sort !== "oldest") p.set("sort", f.sort)
  if (f.q) p.set("q", f.q)
  return p.toString()
}

/** What the server filters on (everything except the text search). */
export function serverFilters(f: UiFilters) {
  const { q: _q, ...rest } = f
  return rest
}
