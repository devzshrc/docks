"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  IconCircleCheck,
  IconCircleDot,
  IconCircleX,
  IconExternalLink,
  IconGitBranch,
} from "@tabler/icons-react"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Fragment, useEffect, useRef, useState } from "react"

import { FileIcon } from "@/components/file-icon"
import { Count, DrawTick, flash, useJustBecame } from "@/components/motion"
import { Checklist } from "@/components/review/checklist"
import { AskPanel } from "@/components/review/ask-panel"
import { FixWithAgent, OpenInPx0 } from "@/components/review/agent-handoff"
import { FileFinder } from "@/components/review/file-finder"
import { FileDiff, type PendingComment } from "@/components/review/file-diff"
import { GuidePanel } from "@/components/review/guide-panel"
import { ReviewActions } from "@/components/review/review-actions"
import { LabelsEditor } from "@/components/review/labels-editor"
import { ReviewerPicker } from "@/components/review/reviewer-picker"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useDraft } from "@/hooks/use-draft"
import { commentLabel } from "@/lib/diff"
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
  const [pending, setPending] = useDraft<PendingComment[]>(`draft:comments:${repo}#${number}`, [])
  const [sinceOnly, setSinceOnly] = useState(false)
  const [mode, setModeState] = useState<"unified" | "split">("unified")
  useEffect(() => {
    try {
      if (localStorage.getItem("diff.mode") === "split") setModeState("split")
    } catch {}
  }, [])
  const setMode = (m: "unified" | "split") => {
    setModeState(m)
    try {
      localStorage.setItem("diff.mode", m)
    } catch {}
  }
  const threads = useQuery(trpc.review.threads.queryOptions({ repo, number }))
  const since = useQuery(trpc.review.sinceLastReview.queryOptions({ repo, number }))
  const refreshThreads = () => queryClient.invalidateQueries(trpc.review.threads.queryFilter({ repo, number }))

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

  // Keyboard review mode. Reads live from the query cache so the handler never goes stale.
  const filesNow = () => queryClient.getQueryData(queryOptions.queryKey)?.files ?? []
  function jumpTo(path: string) {
    const id = `file-${path}`
    if (decodeURIComponent(location.hash) === `#${id}`) {
      const el = document.getElementById(id)
      el?.scrollIntoView({ behavior: "smooth" })
      flash(el)
    }
    else location.hash = id
  }
  function currentFile() {
    const els = [...document.querySelectorAll<HTMLElement>('section[id^="file-"]')]
    let cur = els[0]
    for (const el of els) if (el.getBoundingClientRect().top <= 140) cur = el
    return cur?.id.slice("file-".length)
  }
  function nextUnviewed(after?: string) {
    const list = filesNow()
    const at = list.findIndex((f) => f.filename === after)
    const order = [...list.slice(at + 1), ...list.slice(0, at + 1)]
    const next = order.find((f) => !f.viewed && f.filename !== after)
    if (next) jumpTo(next.filename)
    else document.getElementById("review-actions")?.scrollIntoView({ behavior: "smooth", block: "center" })
  }
  function setViewed(path: string, v: boolean) {
    const f = filesNow().find((x) => x.filename === path)
    if (!f) return
    markViewed.mutate({ repo, number, path, fileSha: f.sha, viewed: v })
    if (v) nextUnviewed(path)
  }
  const keys = useRef({ setViewed, jumpTo, currentFile, filesNow })
  keys.current = { setViewed, jumpTo, currentFile, filesNow }
  const help = useRef<HTMLDialogElement>(null)
  const allViewed = data.data ? data.data.files.length > 0 && data.data.files.every((f) => f.viewed) : false
  const justDone = useJustBecame(allViewed)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey || t?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t?.tagName ?? "")) return
      if (document.querySelector("dialog[open]") && e.key !== "?") return
      const k = keys.current
      const list = k.filesNow()
      const cur = k.currentFile()
      const i = list.findIndex((f) => f.filename === cur)
      if (e.key === "j" || e.key === "k") {
        const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === "j" ? 1 : -1)))]
        if (next) k.jumpTo(next.filename)
      } else if (e.key === "n" || e.key === "p") {
        const hunks = [...document.querySelectorAll<HTMLElement>("tr[data-hunk]")]
        const mid = 150
        const target =
          e.key === "n"
            ? hunks.find((h) => h.getBoundingClientRect().top > mid + 5)
            : hunks.findLast((h) => h.getBoundingClientRect().top < mid - 5)
        target?.scrollIntoView({ block: "start", behavior: "smooth" })
      } else if (e.key === "v" && cur) {
        const f = list.find((x) => x.filename === cur)
        if (f) k.setViewed(cur, !f.viewed)
      } else if (e.key === "?") {
        if (help.current?.open) help.current.close()
        else help.current?.showModal()
      } else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (data.isPending) return <Skeleton className="h-64 w-full" />
  if (data.error) return <p className="text-destructive text-sm">{data.error.message}</p>

  const { pr, files, reviewers, checks, me } = data.data
  const viewed = files.filter((f) => f.viewed).length
  const ready = guide.data?.status === "ready" ? guide.data.guide : null
  const stepFiles =
    activeStep !== null && ready?.steps[activeStep] ? new Set(ready.steps[activeStep].files) : null
  const newSince = since.data?.files ? new Set(since.data.files) : null
  const visible = files
    .filter((f) => !stepFiles || stepFiles.has(f.filename))
    .filter((f) => !sinceOnly || !newSince || newSince.has(f.filename))
  const threadsFor = (path: string) => (threads.data?.threads ?? []).filter((t) => t.path === path)
  const blocking = (threads.data?.threads ?? []).filter((t) => !t.isResolved && t.comments[0] && commentLabel(t.comments[0].body) === "blocking").length
  const checklistItems = [
    ...data.data.checklistTemplate.map((question) => ({ question, files: [] as string[] })),
    ...(ready?.checklist ?? []),
  ]

  return (
    <div className="animate-in fade-in flex flex-col gap-6 duration-300">
      <header className="space-y-5">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {pr.title} <span className="text-muted-foreground font-normal">#{pr.number}</span>
          </h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {pr.state !== "open" && <Badge variant="secondary">{pr.state}</Badge>}
            <span className="text-foreground font-medium">{pr.author}</span>
            <span className="flex items-center gap-1 font-mono text-xs">
              <IconGitBranch className="size-3.5" aria-hidden />
              {pr.headRef} → {pr.baseRef}
            </span>
            <span className="tabular-nums">
              <span className="text-emerald-600">+{pr.additions}</span>{" "}
              <span className="text-destructive">−{pr.deletions}</span> · {files.length} files
            </span>
            <a href={pr.url} target="_blank" rel="noreferrer" className="hover:text-foreground flex items-center gap-1">
              View on GitHub <IconExternalLink className="size-3.5" aria-hidden />
            </a>
            {blocking > 0 && (
              <span className="rounded bg-red-500/15 px-1.5 py-px text-xs font-medium text-red-700 dark:text-red-300">
                {blocking} blocking
              </span>
            )}
            <OpenInPx0 prUrl={pr.url} branch={pr.headRef} />
            <FixWithAgent
              context={{
                repo, number, branch: pr.headRef, path: null, line: null,
                comments: (threads.data?.threads ?? [])
                  .filter((t) => !t.isResolved)
                  .flatMap((t) => t.comments.map((c) => ({ ...c, path: t.path, line: t.line }))),
              }}
            />
          </div>
        </div>
        {/* Aligned label column: the eye scans down one edge instead of hunting. */}
        <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 text-sm">
          {pr.state === "open" && (
            <>
              <dt className="text-muted-foreground pt-1">Reviewers</dt>
              <dd>
                <ReviewerPicker repo={repo} number={number} />
              </dd>
            </>
          )}
          <dt className="text-muted-foreground pt-1">Labels</dt>
          <dd>
            <LabelsEditor repo={repo} number={number} labels={pr.labels} canAct={data.data.canAct && pr.state === "open"} />
          </dd>
          {reviewers.length > 0 && (
            <>
              <dt className="text-muted-foreground pt-0.5">Verdicts</dt>
              <dd className="flex flex-wrap items-center gap-1.5">
                {reviewers.map((r) => {
                  const s = REVIEW_STATE[r.state as keyof typeof REVIEW_STATE] ?? REVIEW_STATE.PENDING
                  return (
                    <Badge key={r.login} variant={s.variant}>
                      {r.login} · {s.label}
                    </Badge>
                  )
                })}
              </dd>
            </>
          )}
          {checks.length > 0 && (
            <>
              <dt className="text-muted-foreground">Checks</dt>
              <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {checks.map((c) => (
                  <span key={c.name} className="flex items-center gap-1 text-xs">
                    <CheckIcon status={c.status} conclusion={c.conclusion} />
                    {c.name}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>
      </header>

      <div className="grid gap-6 border-t pt-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>Reviewed</span>
              <span className="text-muted-foreground">
                <Count value={viewed} /> of {files.length}
              </span>
            </div>
            <div className="bg-muted h-1.5 rounded-full">
              <div
                className={cn("h-1.5 rounded-full bg-emerald-600 transition-all duration-300", justDone && "anim-pulse-once")}
                style={{ width: `${files.length ? (viewed / files.length) * 100 : 0}%` }}
              />
            </div>
          </div>
          <nav aria-label="Files" className="-mx-2 max-h-[60vh] overflow-y-auto">
            <ol className="space-y-px">
              {visible.map((f) => {
                const parts = f.filename.split("/")
                const name = parts.pop()
                const dir = parts.join("/")
                return (
                  <li key={f.filename}>
                    <a
                      href={`#file-${f.filename}`}
                      title={f.filename}
                      className={cn(
                        "hover:bg-muted/70 group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
                        f.tier === "noise" && "opacity-60"
                      )}
                    >
                      <FileIcon path={f.filename} className={cn(f.viewed && !f.changedSinceViewed && "opacity-50")} />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span
                          className={cn(
                            "block truncate font-code text-[12.5px]",
                            f.viewed && !f.changedSinceViewed ? "text-muted-foreground" : "text-foreground"
                          )}
                        >
                          {name}
                        </span>
                        {dir && <span className="text-muted-foreground/70 block truncate text-[11px]">{dir}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 font-code text-[10.5px] tabular-nums">
                        {f.changedSinceViewed ? (
                          <span className="rounded bg-amber-500/15 px-1 py-px text-amber-700 dark:text-amber-400">changed</span>
                        ) : f.viewed ? (
                          <HugeiconsIcon icon={Tick02Icon} size={14} className="animate-in zoom-in-50 fade-in text-emerald-600 duration-200 dark:text-emerald-400" aria-label="Viewed" />
                        ) : (
                          <>
                            {f.additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{f.additions}</span>}
                            {f.deletions > 0 && <span className="text-rose-600 dark:text-rose-400">−{f.deletions}</span>}
                          </>
                        )}
                      </span>
                    </a>
                  </li>
                )
              })}
            </ol>
          </nav>
          <Checklist items={checklistItems} storageKey={`checklist:${repo}#${number}@${pr.headSha}`} />
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
          {pr.state === "open" && <AskPanel repo={repo} number={number} />}
          {files.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="segmented" role="group" aria-label="Diff layout">
                {(["unified", "split"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                    className="capitalize"
                  >
                    {m}
                  </button>
                ))}
              </div>
              {since.data?.files && since.data.files.length > 0 && (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="size-4" checked={sinceOnly} onChange={(e) => setSinceOnly(e.target.checked)} />
                  Only changes since my last review ({since.data.files.length})
                </label>
              )}
              {since.data?.reviewedSha && since.data.files?.length === 0 && (
                <span className="text-muted-foreground">No changes since your last review.</span>
              )}
              {threads.data?.needsGithub && (
                <span className="text-muted-foreground">Connect your GitHub account to see and add comments.</span>
              )}
              <FileFinder files={files} />
            </div>
          )}
          {visible.map((f) => (
            <FileDiff
              key={`${f.filename}:${f.sha}`}
              file={f}
              repo={repo}
              number={number}
              mode={mode}
              canAct={data.data.canAct && pr.state === "open" && !threads.data?.needsGithub}
              threads={threadsFor(f.filename)}
              pending={pending.filter((p) => p.path === f.filename)}
              onAddPending={(c) => setPending((all) => [...all, c])}
              onThreadsChanged={refreshThreads}
              highlightNew={Boolean(newSince?.has(f.filename))}
              branch={pr.headRef}
              onViewedChange={(v) => setViewed(f.filename, v)}
            />
          ))}
        </div>
      </div>

      {pr.state === "open" && !data.data.canAct && (
        <p className="text-muted-foreground border-t pt-3 text-sm">You have read-only access to this workspace.</p>
      )}
      {files.length > 0 && (
        <div className={cn("bg-popover/95 animate-in fade-in slide-in-from-bottom-3 fixed right-6 bottom-6 z-30 flex items-center gap-3 rounded-full border py-1.5 pr-1.5 pl-4 text-sm shadow-lg backdrop-blur duration-300 transition-colors", allViewed && "border-emerald-500/40")}>
          {viewed < files.length ? (
            <>
              <span className="text-muted-foreground tabular-nums">
                <Count value={files.length - viewed} /> file{files.length - viewed === 1 ? "" : "s"} left
              </span>
              <button
                type="button"
                onClick={() => nextUnviewed(currentFile())}
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-3 py-1 text-xs font-medium transition-colors"
              >
                Next unviewed ↓
              </button>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                <DrawTick className="size-3.5" /> All files viewed
              </span>
              {pr.state === "open" && data.data.canAct && (
                <button
                  type="button"
                  onClick={() => document.getElementById("review-actions")?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-3 py-1 text-xs font-medium transition-colors"
                >
                  Submit review
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => help.current?.showModal()}
            className="text-muted-foreground hover:text-foreground hover:bg-muted size-7 rounded-full text-xs transition-colors"
            aria-label="Keyboard shortcuts"
          >
            ?
          </button>
        </div>
      )}

      <dialog
        ref={help}
        onClick={(e) => e.target === help.current && help.current?.close()}
        className="bg-popover text-popover-foreground m-auto w-[min(24rem,calc(100vw-2rem))] rounded-2xl border p-5 shadow-2xl backdrop:bg-black/30"
        aria-label="Keyboard shortcuts"
      >
        <h2 className="mb-3 text-sm font-semibold">Keyboard shortcuts</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {[
            ["j / k", "Next / previous file"],
            ["n / p", "Next / previous change"],
            ["v", "Mark file viewed, go to next unviewed"],
            ["t", "Find file"],
            ["⌘K", "Go to page or PR"],
            ["Shift-click", "Select a line range to comment on"],
            ["?", "Show this list"],
          ].map(([k, d]) => (
            <Fragment key={k}>
              <dt>
                <kbd className="bg-muted rounded border px-1.5 py-0.5 font-sans text-[11px]">{k}</kbd>
              </dt>
              <dd className="text-muted-foreground">{d}</dd>
            </Fragment>
          ))}
        </dl>
      </dialog>

      {pr.state === "open" && data.data.canAct && (
        <div id="review-actions" className="scroll-mt-24">
        <ReviewActions
          repo={repo}
          number={number}
          githubLogin={me}
          canMerge={pr.column === "approved" && !pr.draft}
          mergeableState={pr.mergeableState}
          pending={pending}
          onSubmitted={() => {
            setPending([])
            void refreshThreads()
            void queryClient.invalidateQueries(trpc.review.sinceLastReview.queryFilter({ repo, number }))
          }}
          onDiscardPending={() => setPending([])}
        />
        </div>
      )}
    </div>
  )
}
