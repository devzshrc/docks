"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useRef } from "react"

import { AppShell } from "@/components/app-shell"
import { NewIssueButton } from "@/components/new-issue/button"
import { GettingStarted } from "@/components/getting-started"
import { ReviewBoard } from "@/components/review/board"
import { fromParams, serverFilters, toParams, type UiFilters } from "@/components/review/board-filters"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWorkspace, useWorkspaceSettings } from "@/hooks/use-workspace"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

const SELECT = "border-input bg-background h-9 rounded-md border px-2.5 text-sm"

/** Quick filter as a pill: reads as a filter, not a form field. */
function Chip({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn(
        "h-7 rounded-full border px-3 text-xs font-medium transition-[color,background-color,border-color,transform] duration-150 active:scale-95",
        on && "anim-pop",
        on
          ? "border-primary/30 bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {label}
    </button>
  )
}

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

  if (board.error) return <p className="text-destructive text-sm">{board.error.message}</p>
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
  const active = Object.keys(serverFilters(filters)).length > 0 && toParams(filters) !== ""
  const needsGithub = (filters.mine || filters.waitingOnMe) && data && !data.me

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={search}
          type="search"
          placeholder="Search ( / )"
          aria-label="Search pull requests"
          className="h-9 min-w-48 flex-1 md:max-w-64"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        <select
          className={SELECT}
          aria-label="Repository"
          value={filters.repoIds[0] ?? ""}
          onChange={(e) => set({ repoIds: e.target.value ? [Number(e.target.value)] : [] })}
        >
          <option value="">All repositories</option>
          {data?.repos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.fullName}
            </option>
          ))}
        </select>
        <select className={SELECT} aria-label="Author" value={filters.author ?? ""} onChange={(e) => set({ author: e.target.value || undefined })}>
          <option value="">Any author</option>
          {data?.authors.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        {data && data.labels.length > 0 && (
          <select className={SELECT} aria-label="Label" value={filters.label ?? ""} onChange={(e) => set({ label: e.target.value || undefined })}>
            <option value="">Any label</option>
            {data.labels.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        )}
        {data && data.teams.length > 0 && (
          <select className={SELECT} aria-label="Team" value={filters.teamId ?? ""} onChange={(e) => set({ teamId: e.target.value || undefined })}>
            <option value="">Any team</option>
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <select className={SELECT} aria-label="Size" value={filters.size ?? ""} onChange={(e) => set({ size: (e.target.value || undefined) as UiFilters["size"] })}>
          <option value="">Any size</option>
          <option value="S">Small (&lt;100 lines)</option>
          <option value="M">Medium</option>
          <option value="L">Large (500+)</option>
        </select>
        <select className={SELECT} aria-label="Sort" value={filters.sort} onChange={(e) => set({ sort: e.target.value as UiFilters["sort"] })}>
          <option value="oldest">Oldest first</option>
          <option value="biggest">Biggest first</option>
          <option value="risk">Most at risk</option>
        </select>
      </div>
      <div className="-mt-3 flex flex-wrap items-center gap-2">
        <Chip on={filters.mine} label="Mine" onChange={(v) => set({ mine: v })} />
        <Chip on={filters.waitingOnMe} label="Waiting on me" onChange={(v) => set({ waitingOnMe: v })} />
        <Chip on={filters.priority} label="Priority" onChange={(v) => set({ priority: v })} />
        <Chip on={filters.includeDrafts} label="Show drafts" onChange={(v) => set({ includeDrafts: v })} />
        <span className="flex-1" />
        {active && (
          <Button size="sm" variant="ghost" onClick={() => router.replace(pathname)}>
            Clear filters
          </Button>
        )}
        {active && (
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
        )}
      </div>
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
