"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { useWorkspace } from "@/hooks/use-workspace"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

const PAGES = [
  { label: "Reviews", href: "/review" },
  { label: "Waiting on me", href: "/review?waiting=1" },
  { label: "My pull requests", href: "/review?mine=1" },
  { label: "Team", href: "/team" },
  { label: "Insights", href: "/insights" },
  { label: "Repositories", href: "/settings/repositories" },
  { label: "Integrations", href: "/settings/integrations" },
  { label: "Workspace", href: "/settings/workspace" },
  { label: "Audit log", href: "/settings/audit" },
  { label: "Billing", href: "/settings/billing" },
  { label: "Account", href: "/settings/account" },
]

/** ⌘K / Ctrl+K: jump to a page or a pull request. Native <dialog>, no library (plan M5). */
export function CommandPalette() {
  const trpc = useTRPC()
  const router = useRouter()
  const { workspace } = useWorkspace()
  const dialog = useRef<HTMLDialogElement>(null)
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

  const needle = q.trim().toLowerCase().replace(/^#/, "")
  const items = [
    ...PAGES.map((p) => ({ key: p.href, label: p.label, hint: "Page", href: p.href })),
    ...(board.data?.cards ?? []).map((c) => ({
      key: `${c.repo}#${c.number}`,
      label: `#${c.number} ${c.title}`,
      hint: c.repo,
      href: `/review/${c.repo}/${c.number}`,
    })),
  ]
    .filter((i) => !needle || `${i.label} ${i.hint}`.toLowerCase().includes(needle))
    .slice(0, 12)

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <dialog
      ref={dialog}
      onClose={() => setOpen(false)}
      onClick={(e) => e.target === dialog.current && setOpen(false)}
      className="bg-popover text-popover-foreground mx-auto mt-[15vh] w-[min(36rem,calc(100vw-2rem))] rounded-xl border p-0 shadow-xl backdrop:bg-black/40"
      aria-label="Go to"
    >
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
        placeholder="Go to a page or pull request…"
        aria-label="Search pages and pull requests"
        className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none"
      />
      <ul role="listbox" className="max-h-80 overflow-y-auto p-1 text-sm">
        {items.length === 0 && <li className="text-muted-foreground px-3 py-2">No matches</li>}
        {items.map((i, idx) => (
          <li
            key={i.key}
            role="option"
            aria-selected={idx === active}
            onMouseEnter={() => setActive(idx)}
            onClick={() => go(i.href)}
            className={cn("flex cursor-pointer justify-between gap-3 rounded-md px-3 py-2", idx === active && "bg-muted")}
          >
            <span className="truncate">{i.label}</span>
            <span className="text-muted-foreground shrink-0 text-xs">{i.hint}</span>
          </li>
        ))}
      </ul>
    </dialog>
  )
}
