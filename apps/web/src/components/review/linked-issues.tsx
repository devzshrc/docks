"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

const dot = (open: boolean) => (
  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", open ? "bg-emerald-500" : "bg-violet-500")} aria-label={open ? "Open" : "Closed"} />
)

/** Issues this PR is for (GitHub closing keywords and #n, Linear ENG-123), shown while reviewing. */
export function LinkedIssues({ repo, number }: { repo: string; number: number }) {
  const trpc = useTRPC()
  const q = useQuery({ ...trpc.review.linkedIssues.queryOptions({ repo, number }), staleTime: 60_000, retry: false })
  if (!q.data) return null
  const { github, linear, linearHint } = q.data
  if (!github.length && !linear.length && !linearHint.length) return null

  return (
    <section aria-labelledby="linked-heading" className="animate-in fade-in space-y-2 duration-200">
      <h3 id="linked-heading" className="text-sm font-semibold tracking-tight">
        Linked issues
      </h3>
      <ul className="-mx-2 space-y-0.5">
        {linear.map((i) => (
          <li key={i.id}>
            <a href={i.url} target="_blank" rel="noreferrer" className="hover:bg-muted/70 flex gap-2.5 rounded-lg px-2 py-2 transition-colors">
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: i.state.color }} aria-hidden />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block text-[13px] leading-snug">
                  <span className="text-muted-foreground font-code mr-1.5 text-[11px]">{i.id}</span>
                  {i.title}
                </span>
                <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-[11px]">
                  <span>{i.state.name}</span>
                  {i.priority && i.priority !== "No priority" && <span>· {i.priority}</span>}
                  {i.assignee && <span>· {i.assignee}</span>}
                </span>
              </span>
            </a>
          </li>
        ))}
        {github.map((i) => (
          <li key={i.number}>
            <a
              href={i.url}
              target="_blank"
              rel="noreferrer"
              className={cn("hover:bg-muted/70 flex gap-2.5 rounded-lg px-2 py-2 transition-colors", i.relation === "mentioned" && "opacity-80")}
            >
              {dot(i.state === "open")}
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block text-[13px] leading-snug">
                  <span className="text-muted-foreground font-code mr-1.5 text-[11px]">#{i.number}</span>
                  {i.title}
                </span>
                <span className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span>{i.relation === "closes" ? "Closes on merge" : "Mentioned"}</span>
                  {i.labels.slice(0, 3).map((l) => (
                    <span key={l.name} className="bg-muted rounded px-1.5 py-px">{l.name}</span>
                  ))}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      {linearHint.length > 0 && (
        <p className="text-muted-foreground text-[11px] leading-snug">
          Mentions {linearHint.join(", ")}.{" "}
          <Link href="/settings/integrations" className="hover:text-foreground underline underline-offset-2">
            Connect Linear
          </Link>{" "}
          to see the issue here.
        </p>
      )}
    </section>
  )
}
