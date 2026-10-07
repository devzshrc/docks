"use client"

import { IconGitPullRequest } from "@tabler/icons-react"
import Link from "next/link"

import { GhAvatar } from "@/components/gh-avatar"
import { age, LabelChip, STATUS_LABEL, type IssueItem, type IssueStatus } from "@/components/issues/shared"
import { Skeleton } from "@/components/ui/skeleton"

const LANES: IssueStatus[] = ["todo", "in_progress", "in_review", "done"]
const HINT: Record<IssueStatus, string> = {
  todo: "Open, nobody on it",
  in_progress: "Assigned, or a draft PR exists",
  in_review: "A PR is open for review",
  done: "Closed in the last 2 weeks",
}

/** Status comes from GitHub (assignee, linked PR, closed), so there is nothing to drag. */
export function IssueBoard({ columns, loading }: { columns: Record<IssueStatus, IssueItem[]> | undefined; loading: boolean }) {
  return (
    <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
      {LANES.map((lane) => {
        const items = columns?.[lane] ?? []
        return (
          <section key={lane} aria-label={STATUS_LABEL[lane]} className="w-[80vw] max-w-sm shrink-0 snap-start md:w-auto md:max-w-none">
            <header className="border-hairline mb-3 border-b pb-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-foreground text-sm font-medium">{STATUS_LABEL[lane]}</h2>
                {columns && <span className="text-muted-foreground text-xs tabular-nums">{items.length}</span>}
              </div>
              <p className="text-text-3 mt-0.5 text-xs">{HINT[lane]}</p>
            </header>
            <div className="flex flex-col gap-2.5">
              {loading && [0, 1].map((n) => <Skeleton key={n} className="h-24 w-full rounded-xl" />)}
              {!loading && items.length === 0 && <p className="text-muted-foreground border-hairline rounded-xl border border-dashed px-3 py-6 text-center text-xs">Nothing here</p>}
              {items.map((i) => {
                const pr = i.prs.find((p) => p.state === "open") ?? i.prs.find((p) => p.state === "merged")
                return (
                  <article key={`${i.repo}#${i.number}`} className="bg-card border-hairline hover:border-border-control relative rounded-xl border p-3.5 text-sm transition-colors">
                    <Link href={`/issues/${i.repo}/${i.number}`} className="block outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline">
                      <div className="text-muted-foreground truncate font-mono text-xs">{i.repo}</div>
                      <div className="mt-1 line-clamp-2 leading-snug font-medium">
                        <span className="text-text-3 font-normal">#{i.number}</span> {i.title}
                      </div>
                    </Link>
                    {i.labels.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {i.labels.slice(0, 3).map((l) => (
                          <LabelChip key={l.name} {...l} />
                        ))}
                      </div>
                    )}
                    <div className="text-muted-foreground mt-2.5 flex items-center gap-2 text-xs">
                      <span className="flex -space-x-1.5">
                        {i.assignees.slice(0, 3).map((a) => (
                          <GhAvatar key={a} login={a} className="ring-card size-5 ring-2" />
                        ))}
                      </span>
                      {pr && (
                        <span className="flex items-center gap-1">
                          <IconGitPullRequest className="size-3.5" aria-hidden />#{pr.number}
                        </span>
                      )}
                      <span className="ml-auto tabular-nums">{age(i.updatedAt)}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
