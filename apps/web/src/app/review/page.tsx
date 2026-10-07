"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"

import { QueryError } from "@/components/query-state"
import { AppShell } from "@/components/app-shell"
import { NewIssueButton } from "@/components/new-issue/button"
import { GettingStarted } from "@/components/getting-started"
import { ReviewBoard } from "@/components/review/board"
import { fromParams, serverFilters, toParams, type UiFilters } from "@/components/review/board-filters"
import { Button } from "@/components/ui/button"
import { FilterSelect, Toolbar, ToggleChip, ToolbarSearch } from "@/components/toolbar"
import { useWorkspace, useWorkspaceSettings } from "@/hooks/use-workspace"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

function Board({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const queryClient = useQueryClient()
  const filters = useMemo(() => fromParams(new URLSearchParams(params.toString())), [params])
  const settings = useWorkspaceSettings(workspaceId)
  const account = useQuery(trpc.integration.githubAccount.queryOptions())

  const board = useQuery({
    ...trpc.review.board.queryOptions({ workspaceId, filters: serverFilters(filters) }),
    refetchInterval: 30_000,
  })
  const views = useQuery(trpc.review.savedViews.queryOptions({ workspaceId }))
  const refreshViews = () => queryClient.invalidateQueries(trpc.review.savedViews.queryFilter())
  const saveView = useMutation(trpc.review.saveView.mutationOptions({ onSuccess: refreshViews }))
  const deleteView = useMutation(trpc.review.deleteView.mutationOptions({ onSuccess: refreshViews }))

  const [filtersOpen, setFiltersOpen] = useState(false)
  const search = useRef<HTMLInputElement>(null)
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

  if (board.error) return <QueryError error={board.error} onRetry={() => void board.refetch()} />
  const data = board.data
  if (data && data.repos.length === 0) {
    return (
      <GettingStarted
        hasWorkspace
        hasRepos
        hasEnabledRepo={false}
        hasGithubAccount={Boolean(account.data?.login)}
      />
    )
  }

  const q = filters.q.trim().toLowerCase()
  const cards = data?.cards.filter((c) => !q || `${c.repo}#${c.number} ${c.title}`.toLowerCase().includes(q))
  const activeCount = Object.entries(serverFilters(filters)).filter(([k, v]) => k !== "sort" && v !== undefined && v !== false && v !== "" && !(Array.isArray(v) && v.length === 0)).length
  const active = activeCount > 0 && toParams(filters) !== ""
  const needsGithub = (filters.mine || filters.waitingOnMe) && data && !data.me

  return (
    <div className="space-y-6">
      <Toolbar>
        <ToolbarSearch ref={search} placeholder="Search ( / )" aria-label="Search pull requests" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((o) => !o)}
          className="tex-neutral flex h-8 items-center gap-2 rounded-full px-3 text-xs md:hidden"
        >
          Filters
          {activeCount > 0 && <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[11px] tabular-nums">{activeCount}</span>}
          <span className={cn("text-muted-foreground transition-transform duration-150", filtersOpen && "rotate-90")} aria-hidden>
            ›
          </span>
        </button>
        <div className={cn("animate-in fade-in contents duration-150", !filtersOpen && "max-md:hidden")}>
          <FilterSelect label="Repository" value={String(filters.repoIds[0] ?? "")} onChange={(v) => set({ repoIds: v ? [Number(v)] : [] })}>
            <option value="">All</option>
            {data?.repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Author" value={filters.author ?? ""} onChange={(v) => set({ author: v || undefined })}>
            <option value="">Anyone</option>
            {data?.authors.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </FilterSelect>
          {data && data.labels.length > 0 && (
            <FilterSelect label="Label" value={filters.label ?? ""} onChange={(v) => set({ label: v || undefined })}>
              <option value="">Any</option>
              {data.labels.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </FilterSelect>
          )}
          {data && data.teams.length > 0 && (
            <FilterSelect label="Team" value={filters.teamId ?? ""} onChange={(v) => set({ teamId: v || undefined })}>
              <option value="">Any</option>
              {data.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </FilterSelect>
          )}
          <FilterSelect label="Size" value={filters.size ?? ""} onChange={(v) => set({ size: (v || undefined) as UiFilters["size"] })}>
            <option value="">Any</option>
            <option value="S">Small (&lt;100 lines)</option>
            <option value="M">Medium</option>
            <option value="L">Large (500+)</option>
          </FilterSelect>
          <FilterSelect label="Sort" value={filters.sort} onChange={(v) => set({ sort: v as UiFilters["sort"] })}>
            <option value="oldest">Oldest first</option>
            <option value="biggest">Biggest first</option>
            <option value="risk">Most at risk</option>
          </FilterSelect>
          <span className="bg-hairline mx-1 hidden h-5 w-px md:block" aria-hidden />
          <ToggleChip on={filters.mine} label="Mine" onChange={(v) => set({ mine: v })} />
          <ToggleChip on={filters.waitingOnMe} label="Waiting on me" onChange={(v) => set({ waitingOnMe: v })} />
          <ToggleChip on={filters.priority} label="Priority" onChange={(v) => set({ priority: v })} />
          <ToggleChip on={filters.includeDrafts} label="Drafts" onChange={(v) => set({ includeDrafts: v })} />
        </div>
        {active && (
          <span className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => router.replace(pathname)}>
              Clear
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={saveView.isPending}
              onClick={() => {
                const name = prompt("Name this view")?.trim()
                if (name) saveView.mutate({ workspaceId, name, query: toParams(filters) })
              }}
            >
              Save view
            </Button>
          </span>
        )}
      </Toolbar>
      {views.data && views.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Views</span>
          {views.data.map((v) => (
            <span key={v.id} className="flex items-center rounded-md border">
              <button type="button" className="px-2 py-1 hover:underline" onClick={() => router.replace(`${pathname}?${v.query}`)}>
                {v.name}
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground px-1.5"
                aria-label={`Delete view ${v.name}`}
                onClick={() => deleteView.mutate({ id: v.id })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {needsGithub && (
        <p className="text-muted-foreground text-sm">Connect your GitHub account (Integrations) to use “Mine” and “Waiting on me”.</p>
      )}
      <ReviewBoard
        cards={cards}
        loading={board.isPending}
        showDrafts={filters.includeDrafts}
        stuckHours={data?.stuckHours ?? settings.data?.stuckHours ?? 24}
        canAct={settings.data?.can["review.act"] ?? false}
      />
    </div>
  )
}

function Content() {
  const { workspace, isPending } = useWorkspace()
  if (isPending) return null
  if (!workspace) {
    return <GettingStarted hasWorkspace={false} hasRepos={false} hasEnabledRepo={false} hasGithubAccount={false} />
  }
  return (
    <Suspense>
      <Board workspaceId={workspace.id} />
    </Suspense>
  )
}

export default function Page() {
  return (
    <AppShell title="Reviews" description="Open pull requests across your repositories, grouped by where they are in review." width="wide" actions={<NewIssueButton />}>
      <Content />
    </AppShell>
  )
}
