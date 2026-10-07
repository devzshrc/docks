"use client"

import {
  Analytics01Icon,
  ArrowTurnBackwardIcon,
  Clock01Icon,
  ConnectIcon,
  CreditCardIcon,
  DashboardCircleIcon,
  GitPullRequestIcon,
  Folder01Icon,
  ListViewIcon,
  Search01Icon,
  Settings02Icon,
  Shield01Icon,
  UserCircleIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { useWorkspace } from "@/hooks/use-workspace"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

type IconDef = typeof Search01Icon

const PAGES: { label: string; href: string; icon: IconDef }[] = [
  { label: "Reviews", href: "/review", icon: DashboardCircleIcon },
  { label: "Waiting on me", href: "/review?waiting=1", icon: Clock01Icon },
  { label: "My pull requests", href: "/review?mine=1", icon: GitPullRequestIcon },
  { label: "Team", href: "/team", icon: UserGroupIcon },
  { label: "Insights", href: "/insights", icon: Analytics01Icon },
  { label: "Repositories", href: "/settings/repositories", icon: Folder01Icon },
  { label: "Integrations", href: "/settings/integrations", icon: ConnectIcon },
  { label: "Workspace", href: "/settings/workspace", icon: Settings02Icon },
  { label: "Audit log", href: "/settings/audit", icon: ListViewIcon },
  { label: "Billing", href: "/settings/billing", icon: CreditCardIcon },
  { label: "Account", href: "/settings/account", icon: UserCircleIcon },
  { label: "Security", href: "/settings/account#security", icon: Shield01Icon },
]

type Item = { key: string; group: "Pages" | "Pull requests"; label: string; hint?: string; href: string; icon: IconDef }

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 font-sans text-[10.5px] font-medium">
      {children}
    </kbd>
  )
}

/** ⌘K / Ctrl+K: jump to a page or a pull request. Native <dialog>, no library (plan M5). */
export function CommandPalette() {
  const trpc = useTRPC()
  const router = useRouter()
  const { workspace } = useWorkspace()
  const dialog = useRef<HTMLDialogElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const board = useQuery({
    ...trpc.review.board.queryOptions({ workspaceId: workspace?.id ?? "", filters: { sort: "oldest" } }),
    enabled: open && Boolean(workspace),
  })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQ("")
      setActive(0)
      dialog.current?.showModal()
    } else dialog.current?.close()
  }, [open])

  useEffect(() => {
    list.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active])

  const needle = q.trim().toLowerCase().replace(/^#/, "")
  const match = (s: string) => !needle || s.toLowerCase().includes(needle)
  const pages: Item[] = PAGES.filter((p) => match(p.label)).map((p) => ({ key: p.href, group: "Pages", ...p }))
  const prs: Item[] = (board.data?.cards ?? [])
    .filter((c) => match(`${c.number} ${c.title} ${c.repo}`))
    .slice(0, 8)
    .map((c) => ({
      key: `${c.repo}#${c.number}`,
      group: "Pull requests",
      label: c.title,
      hint: `${c.repo.split("/").pop()} #${c.number}`,
      href: `/review/${c.repo}/${c.number}`,
      icon: GitPullRequestIcon,
    }))
  // PRs first once the person is typing; pages first when browsing.
  const items = needle ? [...prs, ...pages] : [...pages.slice(0, 6), ...prs]

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <dialog
      ref={dialog}
      onClose={() => setOpen(false)}
      onClick={(e) => e.target === dialog.current && setOpen(false)}
      className="bg-popover text-popover-foreground mx-auto mt-[14vh] w-[min(38rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border p-0 shadow-2xl ring-1 ring-black/5 backdrop:bg-black/30 backdrop:backdrop-blur-[2px] dark:ring-white/5"
      aria-label="Go to"
    >
      <div className="flex items-center gap-3 border-b px-4">
        <HugeiconsIcon icon={Search01Icon} size={18} className="text-muted-foreground shrink-0" aria-hidden />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault()
              setActive((a) => (items.length ? (a + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length : 0))
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault()
              go(items[active]!.href)
            }
          }}
          placeholder="Search pages and pull requests…"
          aria-label="Search pages and pull requests"
          className="placeholder:text-muted-foreground/70 h-13 w-full bg-transparent text-[15px] outline-none"
        />
        <Kbd>esc</Kbd>
      </div>

      <div ref={list} role="listbox" className="max-h-[min(24rem,55vh)] overflow-y-auto p-2">
        {items.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-10 text-center">
            <p className="text-sm font-medium">No results</p>
            <p className="text-muted-foreground text-xs">Try a page name, PR title or number.</p>
          </div>
        )}
        {items.map((i, idx) => (
          <div key={i.key}>
            {i.group !== items[idx - 1]?.group && (
              <div className="text-muted-foreground px-2.5 pt-2 pb-1.5 text-[11px] font-medium tracking-wide uppercase first:pt-1">
                {i.group}
              </div>
            )}
            <div
              role="option"
              data-idx={idx}
              aria-selected={idx === active}
              onMouseMove={() => setActive(idx)}
              onClick={() => go(i.href)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                idx === active ? "bg-accent text-accent-foreground" : "text-foreground/90"
              )}
            >
              <HugeiconsIcon
                icon={i.icon}
                size={17}
                className={cn("shrink-0", idx === active ? "text-foreground" : "text-muted-foreground")}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{i.label}</span>
              {i.hint && <span className="text-muted-foreground shrink-0 font-mono text-[11px]">{i.hint}</span>}
              {idx === active && (
                <HugeiconsIcon icon={ArrowTurnBackwardIcon} size={14} className="text-muted-foreground shrink-0" aria-hidden />
              )}
            </div>
          </div>
        ))}
        {board.isLoading && (
          <div className="text-muted-foreground px-2.5 py-2 text-xs">Loading pull requests…</div>
        )}
      </div>

      <div className="text-muted-foreground bg-muted/40 flex items-center gap-4 border-t px-4 py-2.5 text-[11px]">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          Navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd>
          Open
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
          Toggle
        </span>
      </div>
    </dialog>
  )
}
