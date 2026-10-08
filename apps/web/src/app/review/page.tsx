"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"

import { QueryError } from "@/components/query-state"
import { AppShell } from "@/components/app-shell"
import { OnboardingGate } from "@/components/onboarding/onboarding"
import { ReviewBoard } from "@/components/review/board"
import { Greeting } from "@/components/review/greeting"
import { fromParams, serverFilters, toParams, type UiFilters } from "@/components/review/board-filters"
import { Button } from "@/components/ui/button"
import { ShellActions, ShellFilters } from "@/components/shell-slots"
import { FilterSelect, ToggleChip, ToolbarSearch } from "@/components/toolbar"
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

  const q = filters.q.trim().toLowerCase()
  const cards = data?.cards.filter((c) => !q || `${c.repo}#${c.number} ${c.title}`.toLowerCase().includes(q))
  const activeCount = Object.entries(serverFilters(filters)).filter(([k, v]) => k !== "sort" && v !== undefined && v !== false && v !== "" && !(Array.isArray(v) && v.length === 0)).length
  const active = activeCount > 0 && toParams(filters) !== ""
  const needsGithub = (filters.mine || filters.waitingOnMe) && data && !data.me

  return (
    <div className="space-y-6">
      <Greeting workspaceId={workspaceId} cards={data?.cards ?? []} />
      <ShellFilters>
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
          <FilterSelect
            label="Repository"
            value={String(filters.repoIds[0] ?? "")}
            onChange={(v) => set({ repoIds: v ? [Number(v)] : [] })}
            options={[{ value: "", label: "All" }, ...(data?.repos.map((r) => ({ value: String(r.id), label: r.fullName })) ?? [])]}
          />
          <FilterSelect
            label="Author"
            value={filters.author ?? ""}
            onChange={(v) => set({ author: v || undefined })}
            options={[{ value: "", label: "Anyone" }, ...(data?.authors.map((a) => ({ value: a, label: a })) ?? [])]}
          />
          {data && data.labels.length > 0 && (
            <FilterSelect
              label="Label"
              value={filters.label ?? ""}
              onChange={(v) => set({ label: v || undefined })}
              options={[{ value: "", label: "Any" }, ...data.labels.map((l) => ({ value: l, label: l }))]}
            />
          )}
          {data && data.teams.length > 0 && (
            <FilterSelect
              label="Team"
              value={filters.teamId ?? ""}
              onChange={(v) => set({ teamId: v || undefined })}
              options={[{ value: "", label: "Any" }, ...data.teams.map((t) => ({ value: t.id, label: t.name }))]}
            />
          )}
          <FilterSelect
            label="Size"
            value={filters.size ?? ""}
            onChange={(v) => set({ size: (v || undefined) as UiFilters["size"] })}
            options={[
              { value: "", label: "Any" },
              { value: "S", label: "Small (<100 lines)" },
              { value: "M", label: "Medium" },
              { value: "L", label: "Large (500+)" },
            ]}
          />
          <FilterSelect
            label="Sort"
            value={filters.sort}
            onChange={(v) => set({ sort: v as UiFilters["sort"] })}
            options={[
              { value: "oldest", label: "Oldest first" },
              { value: "biggest", label: "Biggest first" },
              { value: "risk", label: "Most at risk" },
            ]}
          />
          <span className="bg-hairline mx-1 hidden h-5 w-px md:block" aria-hidden />
          <ToggleChip on={filters.mine} label="Mine" onChange={(v) => set({ mine: v })} />
          <ToggleChip on={filters.waitingOnMe} label="Waiting on me" onChange={(v) => set({ waitingOnMe: v })} />
          <ToggleChip on={filters.priority} label="Priority" onChange={(v) => set({ priority: v })} />
          <ToggleChip on={filters.includeDrafts} label="Drafts" onChange={(v) => set({ includeDrafts: v })} />
        </div>
      </ShellFilters>
      <ShellActions>
        {active && (
          <span className="flex items-center gap-1">
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
      </ShellActions>
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
      {data && data.cards.length === 0 && !active && !filters.q && (
        <div role="status" className="bg-card flex items-start gap-3 rounded-lg border shadow-xs px-5 py-4 text-sm">
          <span className="bg-primary/15 text-primary-text mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs" aria-hidden>
            ✓
          </span>
          <div className="space-y-0.5">
            <p className="font-medium">No open pull requests right now</p>
            <p className="text-muted-foreground">
              Docks is watching {data.repos.length === 1 ? data.repos[0]!.fullName : `${data.repos.length} repositories`}. New and existing pull requests show up here within a minute.
            </p>
          </div>
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
  return (
    <Suspense>
      <OnboardingGate>{(workspaceId) => <Board workspaceId={workspaceId} />}</OnboardingGate>
    </Suspense>
  )
}

export default function Page() {
  return (
    <AppShell title="Reviews" width="wide">
      <Content />
    </AppShell>
  )
}
