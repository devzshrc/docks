"use client"

import type { BoardCard as BoardCardData } from "@docks/api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { IconCircleCheck, IconCircleDot, IconCircleX, IconStar, IconStarFilled } from "@tabler/icons-react"
import Link from "next/link"

import { GhAvatar } from "@/components/gh-avatar"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

function age(iso: string) {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hours < 1) return "just now"
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

const CI = {
  pass: { icon: IconCircleCheck, label: "Checks passed", className: "text-emerald-600" },
  fail: { icon: IconCircleX, label: "Checks failing", className: "text-destructive" },
  pending: { icon: IconCircleDot, label: "Checks running", className: "text-amber-500" },
} as const

/** One PR card. Hierarchy: repo, title, who/when, then a footer of small pills. Actions appear on hover. */
export function BoardCard({ pr, canAct }: { pr: BoardCardData; canAct: boolean }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const priority = useMutation(
    trpc.review.setPriority.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.review.board.queryFilter()),
    })
  )
  const ci = pr.ci === "none" ? null : CI[pr.ci]

  return (
    <div
      className={cn(
        "group bg-card border-hairline hover:border-border-control animate-in fade-in slide-in-from-bottom-1 relative rounded-xl border p-3.5 text-sm transition-colors duration-200 focus-within:ring-2 focus-within:ring-ring/40"
      )}
    >
      {canAct && (
        <button
          type="button"
          className={cn(
            "text-muted-foreground hover:text-foreground absolute top-3 right-3 z-10 transition-[opacity,transform] duration-150 hover:scale-110 active:scale-90 focus-visible:opacity-100",
            pr.priority ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          aria-label={pr.priority ? "Remove priority" : "Mark as priority"}
          aria-pressed={pr.priority}
          disabled={priority.isPending}
          onClick={() => priority.mutate({ repo: pr.repo, number: pr.number, priority: !pr.priority })}
        >
          {pr.priority ? <IconStarFilled className="anim-pop size-4 text-amber-500" /> : <IconStar className="size-4" />}
        </button>
      )}
      <Link href={`/review/${pr.repo}/${pr.number}`} data-card className="block outline-none after:absolute after:inset-0 after:content-['']">
        <div className="text-muted-foreground truncate pr-6 font-mono text-xs">{pr.repo}</div>
        <div className="mt-1 line-clamp-2 pr-6 leading-snug font-medium">
          <span className="text-text-3 font-normal">#{pr.number}</span> {pr.title}
        </div>
      </Link>
      <div className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
        <GhAvatar login={pr.author.login} src={pr.author.avatar_url} className="size-4 text-[9px]" />
        <span className="min-w-0 truncate">{pr.author.login}</span>
        <span className="text-text-3 shrink-0 whitespace-nowrap">· {age(pr.updatedAt)}</span>
        {ci && <ci.icon className={cn("ml-auto size-4 shrink-0", ci.className)} aria-label={ci.label} />}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="pill" title={`${pr.additions + pr.deletions} lines changed`}>
          {pr.size}
          <span className="text-success-text tabular-nums">+{pr.additions}</span>
          <span className="text-danger-text tabular-nums">−{pr.deletions}</span>
        </span>
        {pr.stuck && (
          <span className="pill" data-tone="warning">
            Stuck
          </span>
        )}
        {pr.claimedBy && <span className="pill">{pr.claimedBy.name} is on it</span>}
        {pr.labels.map((l) => (
          <span key={l} className="pill" data-tone="info">
            {l}
          </span>
        ))}
        {pr.reviewers.length > 0 && (
          <span className="ml-auto flex -space-x-1.5">
            {pr.reviewers.slice(0, 3).map((r) => (
              <GhAvatar key={r.login} login={r.login} className="ring-card ring-2" />
            ))}
          </span>
        )}
      </div>
    </div>
  )
}
