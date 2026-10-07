"use client"

import { IconGitPullRequest, IconMessageCircle, IconUserPlus, IconTag, IconX } from "@tabler/icons-react"
import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"

import { GhAvatar } from "@/components/gh-avatar"
import { age, LabelChip, StateIcon, type IssueItem } from "@/components/issues/shared"
import { AssigneeMenu, LabelMenu } from "@/components/issues/pickers"
import { useIssueActions } from "@/components/issues/use-issue-actions"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

const quick = "text-muted-foreground hover:text-foreground hover:bg-hover flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-colors"

/** The pull request that most directly works on this issue, for the little chip on the row. */
function prChip(issue: IssueItem) {
  const best = issue.prs.find((p) => p.state === "open" && p.kind === "closes") ?? issue.prs.find((p) => p.state === "open") ?? issue.prs.find((p) => p.state === "merged")
  if (!best) return null
  const tone = best.state === "merged" ? "text-violet-600 dark:text-violet-400" : best.draft ? "text-text-3" : "text-emerald-600 dark:text-emerald-400"
  return (
    <span className={cn("flex items-center gap-1 text-xs", tone)} title={`PR #${best.number}: ${best.title} (${best.state}${best.draft ? ", draft" : ""})`}>
      <IconGitPullRequest className="size-3.5" aria-hidden />#{best.number}
    </span>
  )
}

export function IssueRow({
  issue,
  selected,
  focused,
  onToggle,
  canAct,
  triage,
  me,
}: {
  issue: IssueItem
  selected: boolean
  focused: boolean
  onToggle: () => void
  canAct: boolean
  triage: boolean
  me: string | null
}) {
  const { update } = useIssueActions()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  // Start loading the issue as the pointer arrives, so the click opens it already filled in.
  const prefetch = () => void queryClient.prefetchQuery(trpc.issues.get.queryOptions({ repo: issue.repo, number: issue.number }))
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = { repo: issue.repo, number: issue.number }
  const labels = issue.labels.map((l) => l.name)

  return (
    <li
      data-selected={selected || undefined}
      className={cn(
        "group hover:bg-hover relative flex items-start gap-3 rounded-lg px-3 py-3 text-sm transition-colors duration-150",
        selected && "bg-primary/5",
        focused && "ring-ring/40 ring-2 ring-inset"
      )}
    >
      {canAct && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select #${issue.number}`}
          className="mt-1 size-3.5 shrink-0 cursor-pointer accent-[var(--primary)]"
        />
      )}
      <StateIcon state={issue.state} reason={issue.stateReason} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <Link href={`/issues/${issue.repo}/${issue.number}`} onMouseEnter={prefetch} onFocus={prefetch} data-row className="line-clamp-2 leading-snug font-medium outline-none hover:underline focus-visible:underline">
          {issue.title}
        </Link>
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-mono">
            {issue.repo}#{issue.number}
          </span>
          <span>
            opened {age(issue.createdAt)} ago by {issue.author}
          </span>
          {issue.milestone && <span className="pill">{issue.milestone}</span>}
          {issue.labels.map((l) => (
            <LabelChip key={l.name} {...l} />
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 pt-0.5">
        {triage && canAct && (
          <div className={cn("flex items-center gap-0.5 transition-opacity", menuOpen ? "opacity-100" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100")}>
            <AssigneeMenu repo={issue.repo} current={issue.assignees} me={me} onChange={(next) => update.mutate({ ...ref, patch: { assignees: next } })} onOpenChange={setMenuOpen}>
              <button type="button" className={quick} aria-label={`Assign #${issue.number}`}>
                <IconUserPlus className="size-3.5" aria-hidden />
                Assign
              </button>
            </AssigneeMenu>
            <LabelMenu repo={issue.repo} current={labels} onChange={(next) => update.mutate({ ...ref, patch: { labels: next } })} onOpenChange={setMenuOpen}>
              <button type="button" className={quick} aria-label={`Label #${issue.number}`}>
                <IconTag className="size-3.5" aria-hidden />
                Label
              </button>
            </LabelMenu>
            <button type="button" className={quick} aria-label={`Close #${issue.number}`} onClick={() => update.mutate({ ...ref, patch: { state: "closed", stateReason: "completed" } })}>
              <IconX className="size-3.5" aria-hidden />
              Close
            </button>
          </div>
        )}
        {issue.stale && <span className="pill text-warning-text" title="No activity for two weeks">stale</span>}
        {prChip(issue)}
        {issue.comments > 0 && (
          <span className="text-muted-foreground flex items-center gap-1 text-xs tabular-nums">
            <IconMessageCircle className="size-3.5" aria-hidden />
            {issue.comments}
          </span>
        )}
        <span className="flex -space-x-1.5" aria-label={issue.assignees.length ? `Assigned to ${issue.assignees.join(", ")}` : "Unassigned"}>
          {issue.assignees.slice(0, 3).map((a) => (
            <GhAvatar key={a} login={a} className="ring-card size-5 ring-2" />
          ))}
        </span>
        <span className="text-text-3 w-9 text-right text-xs tabular-nums">{age(issue.updatedAt)}</span>
      </div>
    </li>
  )
}
