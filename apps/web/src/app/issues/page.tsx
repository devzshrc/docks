"use client"

import { useQuery } from "@tanstack/react-query"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"

import { AppShell } from "@/components/app-shell"
import { OnboardingGate } from "@/components/onboarding/onboarding"
import { IssueBoard } from "@/components/issues/issue-board"
import { IssueInsights } from "@/components/issues/issue-insights"
import { IssueList } from "@/components/issues/issue-list"
import { fromParams, serverFilters, toParams, VIEWS, type Sort, type UiFilters, type View } from "@/components/issues/shared"
import { QueryError } from "@/components/query-state"
import { ShellFilters } from "@/components/shell-slots"
import { FilterSelect, ToggleChip, ToolbarSearch } from "@/components/toolbar"
import { Button } from "@/components/ui/button"
import { useWorkspace, useWorkspaceSettings } from "@/hooks/use-workspace"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

const PAGE = 50

const EMPTY: Record<View, { title: string; hint: string }> = {
  triage: { title: "Inbox zero", hint: "Every open issue has someone on it." },
  open: { title: "No open issues", hint: "Nothing is open across your repositories." },
  mine: { title: "Nothing assigned to you", hint: "Issues assigned to your GitHub account show up here." },
  created: { title: "You haven't opened any issues", hint: "Issues you create show up here." },
  stale: { title: "Nothing is stale", hint: "Every open issue has had activity in the last two weeks." },
  closed: { title: "No closed issues", hint: "Issues closed in the last 90 days show up here." },
  board: { title: "", hint: "" },
  insights: { title: "", hint: "" },
}

function Issues({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const filters = useMemo(() => fromParams(new URLSearchParams(params.toString())), [params])
  const settings = useWorkspaceSettings(workspaceId)
  const canAct = settings.data?.can["review.act"] ?? false
  const account = useQuery({ ...trpc.integration.githubAccount.queryOptions(), staleTime: 5 * 60_000 })
  const me = account.data?.login ?? null
  const [limit, setLimit] = useState(PAGE)
  const search = useRef<HTMLInputElement>(null)

  const isList = filters.view !== "board" && filters.view !== "insights"
  const counts = useQuery({ ...trpc.issues.counts.queryOptions({ workspaceId }), refetchInterval: 60_000 })
  const facets = useQuery({ ...trpc.issues.facets.queryOptions({ workspaceId }), staleTime: 2 * 60_000 })
  const list = useQuery({
    ...trpc.issues.list.queryOptions({ workspaceId, filters: serverFilters(filters), limit }),
    enabled: isList,
    refetchInterval: (q) => (q.state.data?.syncing ? 4_000 : 30_000),
  })
  const board = useQuery({
    ...trpc.issues.board.queryOptions({ workspaceId, repoIds: filters.repoId ? [filters.repoId] : undefined }),
    enabled: filters.view === "board",
    refetchInterval: 30_000,
  })

  useEffect(() => setLimit(PAGE), [filters.view, filters.repoId, filters.assignee, filters.label, filters.milestone, filters.q, filters.sort])
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
        e.preventDefault()
        search.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const set = (patch: Partial<UiFilters>) => {
    const qs = toParams({ ...filters, ...patch })
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  const error = isList ? list.error : filters.view === "board" ? board.error : null
  if (error) return <QueryError error={error} onRetry={() => void (isList ? list : board).refetch()} />

  const repos = list.data?.repos ?? []
  const fixedAssignee = filters.view === "triage" || filters.view === "mine"
  const filtered = Boolean(filters.q || filters.repoId || filters.label || filters.milestone || (!fixedAssignee && filters.assignee))
  const needsGithub = (filters.view === "mine" || filters.view === "created") && !me
  const showFilters = filters.view !== "insights"
  const empty = EMPTY[filters.view]

  return (
    <div className="space-y-5">
      {showFilters && (
        <ShellFilters>
          <ToolbarSearch ref={search} placeholder="Search ( / )" aria-label="Search issues" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
          <FilterSelect
            label="Repository"
            value={String(filters.repoId ?? "")}
            onChange={(v) => set({ repoId: v ? Number(v) : undefined })}
            options={[{ value: "", label: "All" }, ...repos.map((r) => ({ value: String(r.id), label: r.fullName }))]}
          />
          {isList && !fixedAssignee && (
            <FilterSelect
              label="Assignee"
              value={filters.assignee ?? ""}
              onChange={(v) => set({ assignee: v || undefined })}
              options={[{ value: "", label: "Anyone" }, { value: "none", label: "Unassigned" }, ...(facets.data?.assignees.map((a) => ({ value: a, label: a })) ?? [])]}
            />
          )}
          {facets.data && facets.data.labels.length > 0 && (
            <FilterSelect label="Label" value={filters.label ?? ""} onChange={(v) => set({ label: v || undefined })} options={[{ value: "", label: "Any" }, ...facets.data.labels.map((l) => ({ value: l, label: l }))]} />
          )}
          {facets.data && facets.data.milestones.length > 0 && (
            <FilterSelect label="Milestone" value={filters.milestone ?? ""} onChange={(v) => set({ milestone: v || undefined })} options={[{ value: "", label: "Any" }, ...facets.data.milestones.map((m) => ({ value: m, label: m }))]} />
          )}
          {isList && (
            <FilterSelect
              label="Sort"
              value={filters.sort ?? serverFilters(filters).sort}
              onChange={(v) => set({ sort: v as Sort })}
              options={[
                { value: "updated", label: "Recently updated" },
                { value: "created", label: "Newest" },
                { value: "oldest", label: "Oldest" },
                { value: "comments", label: "Most comments" },
              ]}
            />
          )}
          {filtered && (
            <Button size="sm" variant="ghost" onClick={() => set({ q: "", repoId: undefined, assignee: undefined, label: undefined, milestone: undefined, sort: undefined })}>
              Clear
            </Button>
          )}
        </ShellFilters>
      )}

      <nav aria-label="Issue views" className="-mx-1 flex flex-wrap gap-1 px-1">
        {VIEWS.map((v) => (
          <ToggleChip
            key={v.id}
            on={filters.view === v.id}
            label={v.label}
            count={v.count && counts.data ? counts.data[v.count] : undefined}
            onChange={() => set({ view: v.id, assignee: undefined, sort: undefined })}
          />
        ))}
      </nav>

      {needsGithub && <p className="text-muted-foreground text-sm">Connect your GitHub account (Integrations) to use this view.</p>}

      {filters.view === "insights" ? (
        <IssueInsights workspaceId={workspaceId} />
      ) : filters.view === "board" ? (
        <IssueBoard columns={board.data?.columns} loading={board.isPending} />
      ) : (
        <>
          <IssueList
            items={list.data?.items}
            loading={list.isPending}
            canAct={canAct}
            triage={filters.view === "triage"}
            closedView={filters.view === "closed"}
            me={me}
            empty={
              list.data?.syncing ? (
                <div className="bg-card rounded-lg border shadow-xs px-6 py-14 text-center">
                  <p className="font-medium">Importing issues from GitHub…</p>
                  <p className="text-muted-foreground mt-1 text-sm">This takes a moment the first time. They'll appear here on their own.</p>
                </div>
              ) : (
                <div className="bg-card rounded-lg border shadow-xs px-6 py-14 text-center">
                  <p className="font-medium">{filtered ? "No issues match these filters" : empty.title}</p>
                  <p className="text-muted-foreground mt-1 text-sm">{filtered ? "Try clearing a filter." : empty.hint}</p>
                </div>
              )
            }
          />
          {list.data && list.data.total > list.data.items.length && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({list.data.total - list.data.items.length} left)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Content() {
  return (
    <Suspense>
      <OnboardingGate>{(workspaceId) => <Issues workspaceId={workspaceId} />}</OnboardingGate>
    </Suspense>
  )
}

export default function Page() {
  return (
    <AppShell title="Issues" description="Triage, track and close issues across your repositories." width="wide">
      <Content />
    </AppShell>
  )
}
