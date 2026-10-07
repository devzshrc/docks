"use client"

import { useQuery } from "@tanstack/react-query"
import { useRef, useState } from "react"

import { useWorkspace } from "@/hooks/use-workspace"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

/**
 * Textarea with @-mention autocomplete of teammates' GitHub logins. GitHub
 * turns "@login" into a real mention (and a notification) when posted.
 */
export function MentionTextarea({
  value,
  onChange,
  className,
  ...props
}: Omit<React.ComponentProps<"textarea">, "value" | "onChange"> & {
  value: string
  onChange: (value: string) => void
}) {
  const trpc = useTRPC()
  const { workspace } = useWorkspace()
  const people = useQuery({
    ...trpc.people.list.queryOptions({ workspaceId: workspace?.id ?? "" }),
    enabled: Boolean(workspace),
  })
  const ref = useRef<HTMLTextAreaElement>(null)
  const [query, setQuery] = useState<string | null>(null)
  const [active, setActive] = useState(0)

  const options = (people.data ?? [])
    .filter((p): p is typeof p & { githubLogin: string } => Boolean(p.githubLogin))
    .filter(
      (p) =>
        query !== null &&
        (p.githubLogin.toLowerCase().startsWith(query) || p.name.toLowerCase().includes(query))
    )
    .slice(0, 6)

  function detect(text: string, caret: number) {
    const m = text.slice(0, caret).match(/(?:^|\s)@([\w-]*)$/)
    setQuery(m ? m[1]!.toLowerCase() : null)
    setActive(0)
  }

  function insert(login: string) {
    const el = ref.current
    if (!el) return
    const caret = el.selectionStart
    const before = value.slice(0, caret).replace(/@[\w-]*$/, `@${login} `)
    const next = before + value.slice(caret)
    onChange(next)
    setQuery(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(before.length, before.length)
    })
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        className={cn("bg-(--field) hover:bg-(--field-hover) w-full rounded-md border px-3 py-2 text-sm", className)}
        aria-autocomplete="list"
        aria-expanded={options.length > 0}
        onChange={(e) => {
          onChange(e.target.value)
          detect(e.target.value, e.target.selectionStart)
        }}
        onKeyDown={(e) => {
          if (!options.length) return
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            setActive((a) => (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length)
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault()
            insert(options[active]!.githubLogin)
          } else if (e.key === "Escape") {
            setQuery(null)
          }
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        {...props}
      />
      {options.length > 0 && (
        <ul role="listbox" className="bg-popover absolute bottom-full z-10 mb-1 w-64 rounded-md border p-1 text-sm shadow-md">
          {options.map((p, i) => (
            <li
              key={p.userId}
              role="option"
              aria-selected={i === active}
              className={cn("cursor-pointer rounded px-2 py-1", i === active && "bg-muted")}
              onMouseDown={(e) => {
                e.preventDefault()
                insert(p.githubLogin)
              }}
            >
              <span className="font-medium">@{p.githubLogin}</span>{" "}
              <span className="text-muted-foreground">{p.name}</span>
              {p.away && <span className="text-muted-foreground"> · away</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
