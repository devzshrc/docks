"use client"

import type { CodeRef } from "@docks/api/issue"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { FileIcon } from "@/components/file-icon"
import { GhAvatar } from "@/components/gh-avatar"
import { Collapse } from "@/components/motion"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export const Label = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
  <label htmlFor={htmlFor} className="text-muted-foreground mb-1.5 block text-xs font-medium">
    {children}
  </label>
)

/** Suggested people, with the reason. Nothing is preselected: assigning notifies someone. */
export function AssigneeChips({
  repo,
  paths,
  selected,
  onToggle,
}: {
  repo: string
  paths: string[]
  selected: string[]
  onToggle: (login: string) => void
}) {
  const trpc = useTRPC()
  const q = useQuery({ ...trpc.issue.suggestAssignees.queryOptions({ repo, paths }), retry: false, staleTime: 60_000 })
  if (q.isPending) return <p className="text-muted-foreground text-xs">Finding people…</p>
  if (q.error || !q.data.length) {
    return <p className="text-muted-foreground text-xs">{q.error ? "Couldn't load suggestions." : "No suggestions. Leave unassigned."}</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {q.data.map((p) => {
        const on = selected.includes(p.login)
        return (
          <button
            key={p.login}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(p.login)}
            title={p.reasons.join(" · ") || p.name}
            className={cn(
              "flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-xs transition-[color,background-color,border-color,transform] duration-150 active:scale-95",
              on ? "border-primary/30 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <GhAvatar login={p.login} />
            <span className="font-medium">{p.login}</span>
            {p.reasons[0] && <span className="text-muted-foreground hidden sm:inline">· {p.reasons[0]}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Open issues with similar titles: a hint, never a blocker. */
export function SimilarStrip({ repo, title }: { repo: string; title: string }) {
  const trpc = useTRPC()
  const debounced = useDebounced(title.trim(), 600)
  const [open, setOpen] = useState(false)
  const q = useQuery({
    ...trpc.issue.similar.queryOptions({ repo, title: debounced }),
    enabled: debounced.length >= 6,
    retry: false,
    staleTime: 60_000,
  })
  const items = q.data?.items ?? []
  if (!items.length) return null
  return (
    <div className="animate-in fade-in rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm duration-200" aria-live="polite">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left text-amber-700 dark:text-amber-400">
        <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
        {items.length} similar open issue{items.length > 1 ? "s" : ""}
        <span className="text-muted-foreground ml-auto text-xs">{open ? "Hide" : "Check"}</span>
      </button>
      <Collapse open={open}>
        <ul className="space-y-0.5 border-t border-amber-500/20 p-1.5">
          {items.map((i) => (
            <li key={i.number}>
              <a href={i.url} target="_blank" rel="noreferrer" className="hover:bg-muted/70 flex items-baseline gap-2 rounded-md px-2 py-1.5 transition-colors">
                <span className="text-muted-foreground font-code text-[11px]">#{i.number}</span>
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                {i.comments > 0 && <span className="text-muted-foreground text-[11px]">{i.comments} 💬</span>}
              </a>
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  )
}

/** Code references found in pasted text (stack traces), offered, never added silently. */
export function TraceOffer({ repo, text, linked, dismissed, onLink, onDismiss }: {
  repo: string
  text: string
  linked: CodeRef[]
  dismissed: boolean
  onLink: (refs: CodeRef[]) => void
  onDismiss: () => void
}) {
  const trpc = useTRPC()
  const debounced = useDebounced(text, 800)
  const looksLikeTrace = /\.[A-Za-z]{1,6}:\d{1,6}|File "[^"]+", line \d+/.test(debounced)
  const q = useQuery({
    ...trpc.issue.references.queryOptions({ repo, text: debounced }),
    enabled: looksLikeTrace && !dismissed,
    retry: false,
    staleTime: 5 * 60_000,
  })
  const fresh = (q.data?.refs ?? []).filter((r) => !linked.some((l) => l.path === r.path && l.line === r.line))
  if (dismissed || !fresh.length) return null
  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm duration-200" aria-live="polite">
      <span>
        Found {fresh.length} code reference{fresh.length > 1 ? "s" : ""} in your text
        <span className="text-muted-foreground font-code ml-1.5 text-[11px]">{fresh.slice(0, 2).map((r) => `${r.path.split("/").pop()}:${r.line}`).join(", ")}{fresh.length > 2 ? "…" : ""}</span>
      </span>
      <span className="ml-auto flex gap-1">
        <button type="button" onClick={() => onLink(fresh)} className="text-primary hover:bg-primary/10 rounded-md px-2 py-1 text-xs font-medium transition-colors">
          Link them
        </button>
        <button type="button" onClick={onDismiss} className="text-muted-foreground hover:bg-muted rounded-md px-2 py-1 text-xs transition-colors">
          Dismiss
        </button>
      </span>
    </div>
  )
}

/** "+ Reference code": fuzzy search over the repo's files; picks become permalinks in the issue. */
export function FilePicker({ repo, onPick }: { repo: string; onPick: (r: CodeRef) => void }) {
  const trpc = useTRPC()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const debounced = useDebounced(q.trim(), 250)
  const res = useQuery({
    ...trpc.issue.searchFiles.queryOptions({ repo, q: debounced }),
    enabled: open && debounced.length >= 2,
    retry: false,
  })
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors">
        <HugeiconsIcon icon={Search01Icon} size={14} aria-hidden /> Reference code
      </button>
    )
  }
  return (
    <div className="animate-in fade-in slide-in-from-top-1 space-y-1 duration-150">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation()
            setOpen(false)
            setQ("")
          }
        }}
        placeholder="Search files…"
        aria-label="Search files to reference"
        className="border-input bg-background h-8 w-full rounded-lg border px-3 text-sm outline-none"
      />
      {res.data?.length === 0 && debounced.length >= 2 && <p className="text-muted-foreground px-1 text-xs">No matching files.</p>}
      {res.error && <p className="text-muted-foreground px-1 text-xs">Couldn&apos;t search files.</p>}
      <ul>
        {(res.data ?? []).map((f) => (
          <li key={f.path}>
            <button
              type="button"
              onClick={() => {
                onPick({ path: f.path, line: 0, url: f.url })
                setOpen(false)
                setQ("")
              }}
              className="hover:bg-muted/70 flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors"
            >
              <FileIcon path={f.path} />
              <span className="font-code truncate">{f.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
