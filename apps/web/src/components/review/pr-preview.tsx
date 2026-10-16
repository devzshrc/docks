"use client"

import { useQuery } from "@tanstack/react-query"
import { HoverCard } from "radix-ui"
import { useState, type ReactNode } from "react"

import { useTRPC } from "@/trpc/react"

const plain = (md: string) =>
  md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#>*_`[\]]/g, "")
    .replace(/\(https?:[^)]+\)/g, "")
    .replace(/\s+/g, " ")
    .trim()

/** Hover a card for a moment to see what the PR is about before opening it. */
export function PrPreview({ repo, number, children }: { repo: string; number: number; children: ReactNode }) {
  const trpc = useTRPC()
  const [open, setOpen] = useState(false)
  const q = useQuery({ ...trpc.review.get.queryOptions({ repo, number }), enabled: open, staleTime: 60_000 })
  const pr = q.data?.pr
  const files = q.data?.files ?? []
  const body = pr?.body ? plain(pr.body) : ""

  return (
    <HoverCard.Root openDelay={450} closeDelay={80} open={open} onOpenChange={setOpen}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="right"
          align="start"
          sideOffset={10}
          collisionPadding={16}
          className="bg-popover text-popover-foreground border-hairline data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out z-50 w-80 rounded-md border p-4 text-sm shadow-lg duration-150"
        >
          {!pr ? (
            <div className="space-y-2" aria-busy>
              <div className="shimmer h-3 w-3/4 rounded" />
              <div className="shimmer h-3 w-full rounded" />
              <div className="shimmer h-3 w-2/3 rounded" />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="leading-snug font-medium">{pr.title}</p>
              <p className="text-muted-foreground line-clamp-3 text-xs leading-relaxed">{body || "No description."}</p>
              {files.length > 0 && (
                <div className="space-y-1">
                  <p className="text-text-3 text-[11px] font-medium tracking-wide uppercase">
                    {files.length} file{files.length === 1 ? "" : "s"} changed
                  </p>
                  <ul className="space-y-0.5">
                    {files.slice(0, 4).map((f) => (
                      <li key={f.filename} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-muted-foreground min-w-0 truncate font-mono">{f.filename}</span>
                        <span className="shrink-0 font-mono tabular-nums">
                          <span className="text-success-text">+{f.additions}</span> <span className="text-danger-text">−{f.deletions}</span>
                        </span>
                      </li>
                    ))}
                    {files.length > 4 && <li className="text-text-3 text-xs">and {files.length - 4} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  )
}
