"use client"

import { IconCheck } from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

const MAX = 80

/** Loads a repo's labels / assignable people / milestones the first time a menu opens. */
export function useRepoMeta(repo: string | undefined, enabled: boolean) {
  const trpc = useTRPC()
  return useQuery({ ...trpc.issues.repoMeta.queryOptions({ repo: repo ?? "" }), enabled: enabled && Boolean(repo), staleTime: 5 * 60_000 })
}

function Filterable({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="px-2 pb-1.5">
      <Input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 text-xs"
      />
    </div>
  )
}

function Check({ on }: { on: boolean }) {
  return <IconCheck className={cn("size-3.5 shrink-0", on ? "opacity-100" : "opacity-0")} aria-hidden />
}

/** Multi-select people menu; the menu stays open while toggling. */
export function AssigneeMenu({
  repo,
  current,
  me,
  onChange,
  open,
  onOpenChange,
  children,
}: {
  repo: string | undefined
  current: string[]
  /** The person's own GitHub login, offered first. */
  me?: string | null
  onChange: (next: string[]) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}) {
  const [inner, setInner] = useState(false)
  const isOpen = open ?? inner
  const [q, setQ] = useState("")
  const meta = useRepoMeta(repo, isOpen)
  const all = meta.data?.assignees ?? []
  const people = [...(me && all.includes(me) ? [me] : []), ...all.filter((a) => a !== me)].filter((a) => a.toLowerCase().includes(q.toLowerCase())).slice(0, MAX)
  const toggle = (login: string) => onChange(current.includes(login) ? current.filter((l) => l !== login) : [...current, login])

  return (
    <DropdownMenu open={isOpen} onOpenChange={(o) => { setInner(o); onOpenChange?.(o); if (!o) setQ("") }}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
        <DropdownMenuLabel>Assign to</DropdownMenuLabel>
        <Filterable placeholder="Filter people" value={q} onChange={setQ} />
        {meta.isPending && <p className="text-muted-foreground px-3 py-2 text-xs">Loading…</p>}
        {meta.error && <p className="text-destructive px-3 py-2 text-xs">{meta.error.message}</p>}
        {meta.data && people.length === 0 && <p className="text-muted-foreground px-3 py-2 text-xs">No one matches</p>}
        {people.map((login) => (
          <DropdownMenuItem key={login} onSelect={(e) => { e.preventDefault(); toggle(login) }}>
            <Check on={current.includes(login)} />
            <span className="truncate">{login}</span>
            {login === me && <span className="text-text-3 ml-auto text-[11px]">you</span>}
          </DropdownMenuItem>
        ))}
        {current.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Clear assignees</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Multi-select labels menu for one repo. */
export function LabelMenu({
  repo,
  current,
  onChange,
  open,
  onOpenChange,
  children,
}: {
  repo: string | undefined
  current: string[]
  onChange: (next: string[]) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}) {
  const [inner, setInner] = useState(false)
  const isOpen = open ?? inner
  const [q, setQ] = useState("")
  const meta = useRepoMeta(repo, isOpen)
  const labels = (meta.data?.labels ?? []).filter((l) => l.name.toLowerCase().includes(q.toLowerCase())).slice(0, MAX)
  const toggle = (name: string) => onChange(current.includes(name) ? current.filter((l) => l !== name) : [...current, name])

  return (
    <DropdownMenu open={isOpen} onOpenChange={(o) => { setInner(o); onOpenChange?.(o); if (!o) setQ("") }}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
        <DropdownMenuLabel>Labels</DropdownMenuLabel>
        <Filterable placeholder="Filter labels" value={q} onChange={setQ} />
        {meta.isPending && <p className="text-muted-foreground px-3 py-2 text-xs">Loading…</p>}
        {meta.error && <p className="text-destructive px-3 py-2 text-xs">{meta.error.message}</p>}
        {meta.data && labels.length === 0 && <p className="text-muted-foreground px-3 py-2 text-xs">No labels match</p>}
        {labels.map((l) => (
          <DropdownMenuItem key={l.name} onSelect={(e) => { e.preventDefault(); toggle(l.name) }}>
            <Check on={current.includes(l.name)} />
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: `#${l.color}` }} aria-hidden />
            <span className="truncate">{l.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Pick one open milestone (or none). */
export function MilestoneMenu({
  repo,
  current,
  onChange,
  children,
}: {
  repo: string | undefined
  current: string | null
  onChange: (number: number | null) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const meta = useRepoMeta(repo, open)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
        <DropdownMenuLabel>Milestone</DropdownMenuLabel>
        {meta.isPending && <p className="text-muted-foreground px-3 py-2 text-xs">Loading…</p>}
        {meta.error && <p className="text-destructive px-3 py-2 text-xs">{meta.error.message}</p>}
        {meta.data && meta.data.milestones.length === 0 && <p className="text-muted-foreground px-3 py-2 text-xs">No open milestones</p>}
        {meta.data?.milestones.map((m) => (
          <DropdownMenuItem key={m.number} onSelect={() => onChange(m.number)}>
            <Check on={current === m.title} />
            <span className="truncate">{m.title}</span>
          </DropdownMenuItem>
        ))}
        {current && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(null)}>Clear milestone</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
