"use client"

import type { BoardCard as BoardCardData } from "@docks/api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { IconCircleCheck, IconCircleDot, IconCircleX, IconStar, IconStarFilled } from "@tabler/icons-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
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

/** One PR card: repo, title, author, age, size, CI, labels, reviewers, priority (§5.2, M5). */
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
        "bg-background focus-within:ring-ring relative rounded-lg border p-3 text-sm focus-within:ring-2",
        pr.stuck && "border-amber-500"
      )}
    >
      {canAct && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground absolute top-2 right-2 z-10"
          aria-label={pr.priority ? "Remove priority" : "Mark as priority"}
          aria-pressed={pr.priority}
          disabled={priority.isPending}
          onClick={() => priority.mutate({ repo: pr.repo, number: pr.number, priority: !pr.priority })}
        >
          {pr.priority ? <IconStarFilled className="size-4 text-amber-500" /> : <IconStar className="size-4" />}
        </button>
      )}
      <Link
        href={`/review/${pr.repo}/${pr.number}`}
        data-card
        className="block outline-none after:absolute after:inset-0 after:content-['']"
      >
        <div className="text-muted-foreground truncate pr-6 font-mono text-xs">{pr.repo}</div>
        <div className="pr-6 font-medium">
          <span className="text-muted-foreground">#{pr.number}</span> {pr.title}
        </div>
      </Link>
      <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
        <img src={pr.author.avatar_url} alt="" className="size-4 rounded-full" />
        <span>{pr.author.login}</span>
        <span>{age(pr.updatedAt)}</span>
        <span title={`${pr.additions + pr.deletions} lines changed`}>
          {pr.size} · <span className="text-emerald-600">+{pr.additions}</span>{" "}
          <span className="text-destructive">−{pr.deletions}</span>
        </span>
        {ci && <ci.icon className={cn("size-4", ci.className)} aria-label={ci.label} />}
        {pr.stuck && <Badge variant="destructive">stuck</Badge>}
        {pr.claimedBy && <Badge variant="secondary">{pr.claimedBy.name} is on it</Badge>}
      </div>
      {(pr.labels.length > 0 || pr.reviewers.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {pr.labels.map((l) => (
            <Badge key={l} variant="secondary" className="font-normal">
              {l}
            </Badge>
          ))}
          {pr.reviewers.map((r) => (
            <Badge key={r.login} variant="outline">
              {r.login}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
