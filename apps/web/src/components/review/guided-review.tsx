"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  IconCircleCheck,
  IconCircleDot,
  IconCircleX,
  IconExternalLink,
  IconGitBranch,
} from "@tabler/icons-react"
import { useState } from "react"

import { Checklist } from "@/components/review/checklist"
import { FileDiff } from "@/components/review/file-diff"
import { GuidePanel } from "@/components/review/guide-panel"
import { ReviewActions } from "@/components/review/review-actions"
import { ReviewerPicker } from "@/components/review/reviewer-picker"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/react"

const REVIEW_STATE = {
  APPROVED: { label: "approved", variant: "default" },
  CHANGES_REQUESTED: { label: "changes requested", variant: "destructive" },
  PENDING: { label: "pending", variant: "outline" },
} as const

function CheckIcon({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (status !== "completed") return <IconCircleDot className="size-4 text-amber-500" aria-label="running" />
  if (conclusion === "success" || conclusion === "skipped" || conclusion === "neutral")
    return <IconCircleCheck className="size-4 text-emerald-600" aria-label="passed" />
  return <IconCircleX className="text-destructive size-4" aria-label="failed" />
}

/** Guided review view (plan.md §5.3): header, ranked file list, diffs, actions. */
export function GuidedReview({ repo, number }: { repo: string; number: number }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const queryOptions = trpc.review.get.queryOptions({ repo, number })
  const data = useQuery(queryOptions)
  const guide = useQuery({
    ...trpc.review.guide.queryOptions({ repo, number }),
    // Generation runs in the job queue; poll until it lands.
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 3_000 : false),
  })
  const [activeStep, setActiveStep] = useState<number | null>(null)

  const markViewed = useMutation(
    trpc.review.markViewed.mutationOptions({
      // Optimistic: flip the checkbox now, roll back on failure.
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: queryOptions.queryKey })
        const previous = queryClient.getQueryData(queryOptions.queryKey)
        queryClient.setQueryData(queryOptions.queryKey, (old) =>
          old && {
            ...old,
            files: old.files.map((f) =>
              f.filename === vars.path
                ? { ...f, viewed: vars.viewed, changedSinceViewed: false }
                : f
            ),
          }
        )
        return { previous }
      },
      onError: (_e, _v, ctx) => queryClient.setQueryData(queryOptions.queryKey, ctx?.previous),
    })
  )

  if (data.isPending) return <Skeleton className="h-64 w-full" />
  if (data.error) return <p className="text-destructive text-sm">{data.error.message}</p>

  const { pr, files, reviewers, checks, me } = data.data
  const viewed = files.filter((f) => f.viewed).length
  const ready = guide.data?.status === "ready" ? guide.data.guide : null
  const stepFiles =
    activeStep !== null && ready?.steps[activeStep] ? new Set(ready.steps[activeStep].files) : null
  const visible = stepFiles ? files.filter((f) => stepFiles.has(f.filename)) : files

  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-2">
        <h2 className="text-xl font-medium">
          {pr.title} <span className="text-muted-foreground font-normal">#{pr.number}</span>
        </h2>
        <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
          {pr.state !== "open" && <Badge variant="secondary">{pr.state}</Badge>}
          <span>{pr.author}</span>
          <span className="flex items-center gap-1 font-mono text-xs">
            <IconGitBranch className="size-4" aria-hidden />
            {pr.headRef} → {pr.baseRef}
          </span>
          <span>
            <span className="text-emerald-600">+{pr.additions}</span>{" "}
            <span className="text-destructive">−{pr.deletions}</span> · {files.length} files
          </span>
          <a href={pr.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline">
            View on GitHub <IconExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
        {pr.state === "open" && <ReviewerPicker repo={repo} number={number} />}
        <div className="flex flex-wrap gap-4 text-sm">
          {reviewers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground mr-1">Verdicts</span>
              {reviewers.map((r) => {
                const s = REVIEW_STATE[r.state as keyof typeof REVIEW_STATE] ?? REVIEW_STATE.PENDING
                return (
                  <Badge key={r.login} variant={s.variant}>
                    {r.login} · {s.label}
                  </Badge>
                )
              })}
            </div>
          )}
          {checks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Checks</span>
              {checks.map((c) => (
                <span key={c.name} className="flex items-center gap-1 text-xs">
                  <CheckIcon status={c.status} conclusion={c.conclusion} />
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>Reviewed</span>
              <span className="text-muted-foreground">
                {viewed} of {files.length}
              </span>
            </div>
            <div className="bg-muted h-1.5 rounded-full">
              <div
                className="h-1.5 rounded-full bg-emerald-600 transition-all"
                style={{ width: `${files.length ? (viewed / files.length) * 100 : 0}%` }}
              />
            </div>
          </div>
          <nav aria-label="Files" className="max-h-[60vh] overflow-y-auto">
            <ol className="space-y-0.5 text-xs">
              {visible.map((f) => (
                <li key={f.filename}>
                  <a
                    href={`#file-${f.filename}`}
                    className={cn(
                      "hover:bg-muted flex items-center gap-2 rounded px-2 py-1 font-mono",
                      f.viewed && "text-muted-foreground line-through",
                      f.tier === "noise" && "opacity-60"
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        f.changedSinceViewed ? "bg-amber-500" : f.viewed ? "bg-emerald-600" : "bg-muted-foreground/40"
                      )}
                      aria-hidden
                    />
                    <span className="truncate" title={f.filename}>
                      {f.filename.split("/").pop()}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          {ready && (
            <Checklist items={ready.checklist} storageKey={`checklist:${repo}#${number}@${pr.headSha}`} />
          )}
        </aside>

        <div className="min-w-0 space-y-3">
          {pr.state === "open" && files.length > 0 && (
            <GuidePanel
              repo={repo}
              number={number}
              state={guide.data}
              activeStep={activeStep}
              onStepChange={setActiveStep}
              canAct={data.data.canAct}
            />
          )}
          {guide.error && <p className="text-destructive text-sm">{guide.error.message}</p>}
          {files.length === 0 && (
            <p className="text-muted-foreground text-sm">No file changes synced for this commit yet.</p>
          )}
          {visible.map((f) => (
            <FileDiff
              key={`${f.filename}:${f.sha}`}
              file={f}
              onViewedChange={(v) =>
                markViewed.mutate({ repo, number, path: f.filename, fileSha: f.sha, viewed: v })
              }
            />
          ))}
        </div>
      </div>

      {pr.state === "open" && !data.data.canAct && (
        <p className="text-muted-foreground border-t pt-3 text-sm">You have read-only access to this workspace.</p>
      )}
      {pr.state === "open" && data.data.canAct && (
        <ReviewActions
          repo={repo}
          number={number}
          githubLogin={me}
          canMerge={pr.column === "approved" && !pr.draft}
        />
      )}
    </div>
  )
}
