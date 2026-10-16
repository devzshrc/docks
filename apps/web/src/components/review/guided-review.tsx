"use client";
import Link from "next/link";
import { errorMessage } from "@/lib/error-message";
import { RiArrowDownSLine } from "@remixicon/react";
import { NativeCheckbox as ShadcnCheckbox } from "@/components/ui-compat/native-checkbox";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Input as ShadcnInput } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconCircleCheck,
  IconCircleDot,
  IconCircleX,
  IconExternalLink,
  IconGitBranch,
} from "@tabler/icons-react";
import { Fragment, useEffect, useRef, useState } from "react";

import { Count, DrawTick, flash, useJustBecame } from "@/components/motion";
import { ScrollFade } from "@/components/scroll-fade";
import { DeadlinePanel } from "@/components/review/deadline-panel";
import { Checklist } from "@/components/review/checklist";
import { FileRail } from "@/components/review/file-rail";
import { FollowUps } from "@/components/review/follow-ups";
import { LinkedIssues } from "@/components/review/linked-issues";
import { AskPanel } from "@/components/review/ask-panel";
import { FixWithAgent, OpenInPx0 } from "@/components/review/agent-handoff";
import { FileFinder } from "@/components/review/file-finder";
import { FileDiff, type PendingComment } from "@/components/review/file-diff";
import { GuidePanel } from "@/components/review/guide-panel";
import { ReviewActions } from "@/components/review/review-actions";
import { LabelsEditor } from "@/components/review/labels-editor";
import { ReviewerPicker } from "@/components/review/reviewer-picker";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cx as cn } from "@/utils/cx";
import {
  ReviewSessionProvider,
  useReviewSession,
} from "@/hooks/use-review-session";
import { commentLabel } from "@/lib/diff";
import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/react";

/** One row of the details panel: fixed label column, controls aligned on a shared left edge. */
const ROW =
  "grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4 px-4 py-2.5 min-h-11";

const REVIEW_STATE = {
  APPROVED: { label: "Approved", variant: "secondary" },
  CHANGES_REQUESTED: { label: "Changes requested", variant: "destructive" },
  PENDING: { label: "Pending", variant: "secondary" },
} as const;

function CheckIcon({
  status,
  conclusion,
}: {
  status: string;
  conclusion: string | null;
}) {
  if (status !== "completed")
    return (
      <IconCircleDot className="size-4 text-warning" aria-label="running" />
    );
  if (
    conclusion === "success" ||
    conclusion === "skipped" ||
    conclusion === "neutral"
  )
    return (
      <IconCircleCheck className="size-4 text-success" aria-label="passed" />
    );
  return <IconCircleX className="text-danger size-4" aria-label="failed" />;
}

/** Guided review view (plan.md §5.3): header, ranked file list, diffs, actions. */
export function GuidedReview({
  repo,
  number,
}: {
  repo: string;
  number: number;
}) {
  const { data: auth } = useSession();
  return (
    <ReviewSessionProvider
      key={`${auth?.user.id ?? "loading"}:${repo}#${number}`}
      repo={repo}
      number={number}
    >
      <GuidedReviewContent repo={repo} number={number} />
    </ReviewSessionProvider>
  );
}

function GuidedReviewContent({
  repo,
  number,
}: {
  repo: string;
  number: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryOptions = trpc.review.get.queryOptions({ repo, number });
  const data = useQuery(queryOptions);
  const guide = useQuery({
    ...trpc.review.guide.queryOptions({ repo, number }),
    // Generation runs in the job queue; poll until it lands.
    refetchInterval: (q) =>
      q.state.data?.status === "pending" ? 3_000 : false,
  });
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const session = useReviewSession();
  const pending = session.data.pending;
  const setPending = (
    next: PendingComment[] | ((all: PendingComment[]) => PendingComment[]),
  ) =>
    session.update((state) => ({
      ...state,
      pending: (typeof next === "function" ? next(state.pending) : next).map(
        (c) => ({
          ...c,
          id: "id" in c ? String(c.id) : crypto.randomUUID(),
          headSha: "headSha" in c ? String(c.headSha) : session.headSha,
        }),
      ),
    }));
  const [sinceOnly, setSinceOnly] = useState(false);
  // Phones: PR details and the file list start folded so the diff is one scroll away.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [mode, setModeState] = useState<"unified" | "split">("unified");
  useEffect(() => {
    try {
      if (localStorage.getItem("diff.mode") === "split") setModeState("split");
    } catch {}
  }, []);
  const setMode = (m: "unified" | "split") => {
    setModeState(m);
    try {
      localStorage.setItem("diff.mode", m);
    } catch {}
  };
  const threads = useQuery(trpc.review.threads.queryOptions({ repo, number }));
  const since = useQuery(
    trpc.review.sinceLastReview.queryOptions({ repo, number }),
  );
  const refreshThreads = () =>
    Promise.all([
      queryClient.invalidateQueries(
        trpc.review.threads.queryFilter({ repo, number }),
      ),
      queryClient.invalidateQueries(
        trpc.review.mergeReadiness.queryFilter({ repo, number }),
      ),
    ]);

  const markViewed = useMutation(
    trpc.review.markViewed.mutationOptions({
      // Optimistic: flip the checkbox now, roll back on failure.
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: queryOptions.queryKey });
        const previous = queryClient.getQueryData(queryOptions.queryKey);
        queryClient.setQueryData(
          queryOptions.queryKey,
          (old) =>
            old && {
              ...old,
              files: old.files.map((f) =>
                f.filename === vars.path
                  ? { ...f, viewed: vars.viewed, changedSinceViewed: false }
                  : f,
              ),
            },
        );
        return { previous };
      },
      onError: (_e, _v, ctx) =>
        queryClient.setQueryData(queryOptions.queryKey, ctx?.previous),
    }),
  );

  // Keyboard review mode. Reads live from the query cache so the handler never goes stale.
  const filesNow = () =>
    queryClient.getQueryData(queryOptions.queryKey)?.files ?? [];
  function jumpTo(path: string) {
    session.update((state) => ({ ...state, lastLocation: { path } }));
    const id = `file-${path}`;
    if (decodeURIComponent(location.hash) === `#${id}`) {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: "smooth" });
      flash(el);
    } else location.hash = id;
  }
  function currentFile() {
    const els = [
      ...document.querySelectorAll<HTMLElement>('section[id^="file-"]'),
    ];
    let cur = els[0];
    for (const el of els) if (el.getBoundingClientRect().top <= 140) cur = el;
    return cur?.id.slice("file-".length);
  }
  function nextUnviewed(after?: string) {
    const list = filesNow();
    const at = list.findIndex((f) => f.filename === after);
    const order = [...list.slice(at + 1), ...list.slice(0, at + 1)];
    const next = order.find((f) => !f.viewed && f.filename !== after);
    if (next) jumpTo(next.filename);
    else
      document
        .getElementById("review-actions")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function setViewed(path: string, v: boolean) {
    const f = filesNow().find((x) => x.filename === path);
    if (!f) return;
    markViewed.mutate({ repo, number, path, fileSha: f.sha, viewed: v });
    if (v) nextUnviewed(path);
  }
  const keys = useRef({ setViewed, jumpTo, currentFile, filesNow });
  keys.current = { setViewed, jumpTo, currentFile, filesNow };
  const [helpOpen, setHelpOpen] = useState(false);
  const allViewed = data.data
    ? data.data.files.length > 0 && data.data.files.every((f) => f.viewed)
    : false;
  const justDone = useJustBecame(allViewed);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        t?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(t?.tagName ?? "")
      )
        return;
      if (
        document.querySelector('dialog[open], [role="dialog"]') &&
        e.key !== "?"
      )
        return;
      const k = keys.current;
      const list = k.filesNow();
      const cur = k.currentFile();
      const i = list.findIndex((f) => f.filename === cur);
      if (e.key === "j" || e.key === "k") {
        const next =
          list[
            Math.max(0, Math.min(list.length - 1, i + (e.key === "j" ? 1 : -1)))
          ];
        if (next) k.jumpTo(next.filename);
      } else if (e.key === "n" || e.key === "p") {
        const hunks = [
          ...document.querySelectorAll<HTMLElement>("tr[data-hunk]"),
        ];
        const mid = 150;
        const target =
          e.key === "n"
            ? hunks.find((h) => h.getBoundingClientRect().top > mid + 5)
            : hunks.findLast((h) => h.getBoundingClientRect().top < mid - 5);
        target?.scrollIntoView({ block: "start", behavior: "smooth" });
      } else if (e.key === "v" && cur) {
        const f = list.find((x) => x.filename === cur);
        if (f) k.setViewed(cur, !f.viewed);
      } else if (e.key === "?") {
        setHelpOpen((open) => !open);
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const capture = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const path = keys.current.currentFile();
        if (!path) return;
        const section = document.getElementById(`file-${path}`);
        const lines = section
          ? [...section.querySelectorAll<HTMLElement>("[data-review-line]")]
          : [];
        const line = lines.find((el) => el.getBoundingClientRect().top >= 130);
        session.update((state) => ({
          ...state,
          lastLocation: {
            path,
            ...(line ? { line: Number(line.dataset.reviewLine) } : {}),
          },
        }));
      }, 500);
    };
    window.addEventListener("scroll", capture, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", capture);
    };
  }, []);

  if (data.isPending) return <Skeleton className="h-64 w-full" />;
  if (data.error)
    return <p className="text-destructive text-sm">{errorMessage(data.error)}</p>;

  const { pr, files, reviewers, checks, me } = data.data;
  const outdatedDrafts = pending.some((c) => c.headSha !== pr.headSha);
  const viewed = files.filter((f) => f.viewed).length;
  const ready = guide.data?.status === "ready" ? guide.data.guide : null;
  const stepFiles =
    activeStep !== null && ready?.steps[activeStep]
      ? new Set(ready.steps[activeStep].files)
      : null;
  const newSince = since.data?.files ? new Set(since.data.files) : null;
  const visible = files
    .filter((f) => !stepFiles || stepFiles.has(f.filename))
    .filter((f) => !sinceOnly || !newSince || newSince.has(f.filename));
  const threadsFor = (path: string) =>
    (threads.data?.threads ?? []).filter((t) => t.path === path);
  const blocking = (threads.data?.threads ?? []).filter(
    (t) =>
      !t.isResolved &&
      t.comments[0] &&
      commentLabel(t.comments[0].body) === "blocking",
  ).length;
  const checklistItems = [
    ...data.data.checklistTemplate.map((question) => ({
      question,
      files: [] as string[],
    })),
    ...(ready?.checklist ?? []),
  ];

  return (
    <div className="animate-in fade-in flex flex-col gap-6 pb-20 duration-300">
      {session.data.lastLocation && (
        // Floats instead of sitting above the title, so it never pushes the page down when it appears.
        <ShadcnButton
          variant="outline"
          type="button"
          className="bg-card animate-in fade-in slide-in-from-bottom-2 fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full text-xs shadow-lg"
          onClick={() => {
            const location = session.data.lastLocation;
            if (location && files.some((f) => f.filename === location.path)) {
              jumpTo(location.path);
              window.dispatchEvent(
                new CustomEvent("review-resume", { detail: location }),
              );
            } else
              document.querySelector('section[id^="file-"]')?.scrollIntoView();
          }}
        >
          Resume review at {session.data.lastLocation.path}
        </ShadcnButton>
      )}
      <header className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-title-1-medium text-text-primary">
              {pr.title}{" "}
              <span className="text-text-3 font-normal">#{pr.number}</span>
            </h1>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              {pr.state !== "open" && (
                <Badge variant="secondary">{pr.state}</Badge>
              )}
              <span className="text-foreground text-sm font-medium">
                {pr.author}
              </span>
              <span className="flex items-center gap-1 font-mono">
                <IconGitBranch className="size-3.5" aria-hidden />
                {pr.headRef} → {pr.baseRef}
              </span>
              <span className="tabular-nums">
                <span className="text-success-text">+{pr.additions}</span>{" "}
                <span className="text-danger-text">−{pr.deletions}</span>
                <span className="text-text-3"> · {files.length} files</span>
              </span>
              {blocking > 0 && (
                <Badge variant="secondary" className="" data-tone="danger">
                  {blocking} blocking
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] max-sm:px-4 sm:flex-wrap sm:overflow-visible [&>*]:shrink-0">
            <a
              href={pr.url}
              target="_blank"
              rel="noreferrer"
              className="tex-neutral flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
            >
              GitHub <IconExternalLink className="size-3.5" aria-hidden />
            </a>
            <OpenInPx0 prUrl={pr.url} branch={pr.headRef} />
            <FixWithAgent
              context={{
                repo,
                number,
                branch: pr.headRef,
                path: null,
                line: null,
                comments: (threads.data?.threads ?? [])
                  .filter((t) => !t.isResolved)
                  .flatMap((t) =>
                    t.comments.map((c) => ({
                      ...c,
                      path: t.path,
                      line: t.line,
                    })),
                  ),
              }}
            />
          </div>
        </div>
        <div>
          <ShadcnButton
            variant="row"
            size="none"
            type="button"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((o) => !o)}
            className="hover:bg-muted/60 flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors lg:hidden"
          >
            <span className="font-medium">Details</span>
            <span className="text-muted-foreground flex-1 truncate text-right text-xs">
              {checks.length
                ? `${checks.filter((c) => c.conclusion === "success").length}/${checks.length} checks`
                : "no checks"}{" "}
              · {reviewers.length} verdict{reviewers.length === 1 ? "" : "s"}
            </span>
            <span
              className={cn(
                "text-muted-foreground transition-transform duration-150",
                detailsOpen && "rotate-90",
              )}
              aria-hidden
            >
              ›
            </span>
          </ShadcnButton>
          <div
            className={cn(
              "animate-in fade-in pt-4 duration-150 lg:block lg:pt-0",
              detailsOpen ? "block" : "hidden",
            )}
          >
            {/* Aligned label column: the eye scans down one edge instead of hunting. */}
            <dl className="bg-card divide-y rounded-lg border shadow-xs text-sm">
              {pr.state === "open" && (
                <div className={ROW}>
                  <dt className="text-muted-foreground text-xs">Reviewers</dt>
                  <dd>
                    <ReviewerPicker repo={repo} number={number} />
                  </dd>
                </div>
              )}
              <div className={ROW}>
                <dt className="text-muted-foreground text-xs">Labels</dt>
                <dd>
                  <LabelsEditor
                    repo={repo}
                    number={number}
                    labels={pr.labels}
                    canAct={data.data.canAct && pr.state === "open"}
                  />
                </dd>
              </div>
              {reviewers.length > 0 && (
                <div className={ROW}>
                  <dt className="text-muted-foreground text-xs">Verdicts</dt>
                  <dd className="flex flex-wrap items-center gap-1.5">
                    {reviewers.map((r) => {
                      const s =
                        REVIEW_STATE[r.state as keyof typeof REVIEW_STATE] ??
                        REVIEW_STATE.PENDING;
                      return (
                        <Badge key={r.login} variant={s.variant}>
                          {r.login} · {s.label}
                        </Badge>
                      );
                    })}
                  </dd>
                </div>
              )}
              {checks.length > 0 && (
                <div className={ROW}>
                  <dt className="text-muted-foreground text-xs">Checks</dt>
                  <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {checks.map((c) => (
                      <span
                        key={c.name}
                        className="flex items-center gap-1 text-xs"
                      >
                        <CheckIcon
                          status={c.status}
                          conclusion={c.conclusion}
                        />
                        {c.name}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_260px]">
        <aside className="order-1 space-y-5 rounded-2xl border border-separator-border bg-background-primary-default p-4 lg:col-start-1 lg:row-span-2 lg:sticky lg:top-20 lg:self-start xl:row-span-1">
          <div>
            <ShadcnButton
              variant="row"
              size="none"
              type="button"
              aria-expanded={filesOpen}
              onClick={() => setFilesOpen((o) => !o)}
              className="mb-1.5 flex w-full items-center justify-between text-sm lg:pointer-events-none"
            >
              <span className="flex items-center gap-1.5">
                Reviewed
                <span
                  className={cn(
                    "text-muted-foreground transition-transform duration-150 lg:hidden",
                    filesOpen && "rotate-90",
                  )}
                  aria-hidden
                >
                  ›
                </span>
              </span>
              <span className="text-muted-foreground">
                <Count value={viewed} /> of {files.length}
              </span>
            </ShadcnButton>
            <div className="bg-muted h-1.5 rounded-full">
              <div
                className={cn(
                  "h-1.5 rounded-full bg-emerald-600 transition-all duration-300",
                  justDone && "anim-pulse-once",
                )}
                style={{
                  width: `${files.length ? (viewed / files.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <div className={cn("lg:block", filesOpen ? "block" : "hidden")}>
            <FileRail files={visible} />
          </div>
          <LinkedIssues repo={repo} number={number} />
          <FollowUps repo={repo} number={number} />
          <div className="hidden lg:block">
            <Checklist
              items={checklistItems}
              storageKey={`checklist:${repo}#${number}@${pr.headSha}`}
            />
          </div>
        </aside>

        <details
          open
          className="group/context order-2 min-w-0 self-start rounded-2xl surface-raised lg:col-start-2 lg:row-start-1 xl:order-3 xl:col-start-3 xl:row-span-2 xl:sticky xl:top-20"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
            Review context
            <RiArrowDownSLine aria-hidden className="size-4 text-subtle transition-transform duration-200 group-open/context:rotate-180" />
          </summary>
          <ScrollFade className="grid gap-4 px-4 pb-4 xl:max-h-[calc(100svh-10rem)]">
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
            {guide.error && <p className="text-sm text-destructive">{errorMessage(guide.error)}</p>}
            {files.length === 0 && <p className="text-sm text-muted-foreground">No file changes synced for this commit yet.</p>}
            <DeadlinePanel repo={repo} number={number} />
            {pr.state === "open" && (
              <div className="border-t pt-4">
                <AskPanel repo={repo} number={number} />
              </div>
            )}
          </ScrollFade>
        </details>
        <div className="order-3 min-w-0 space-y-4 lg:col-start-2 lg:row-start-2 xl:order-2 xl:row-start-1">
          {files.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div
                className="inline-flex gap-1 rounded-lg border border-separator-border bg-background-primary-default p-1"
                role="group"
                aria-label="Diff layout"
              >
                {(["unified", "split"] as const).map((m) => (
                  <ShadcnButton
                    variant="ghost"
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "capitalize",
                      mode === m && "bg-primary-alpha-10 text-primary-base",
                    )}
                  >
                    {m}
                  </ShadcnButton>
                ))}
              </div>
              {since.data?.files && since.data.files.length > 0 && (
                <label className="flex items-center gap-1.5">
                  <ShadcnCheckbox
                    className="size-4"
                    checked={sinceOnly}
                    onChange={(e) => setSinceOnly(e.target.checked)}
                  />
                  Only changes since my last review ({since.data.files.length})
                </label>
              )}
              {since.data?.reviewedSha && !since.data.complete && (
                <p role="status" className="text-xs text-muted-foreground">
                  Comparison unavailable or incomplete. Inspect the full diff
                  below.
                </p>
              )}
              {since.data?.reviewedSha &&
                since.data.changes &&
                since.data.changes.length > 0 && (
                  <details className="space-y-2 rounded border p-3">
                    <summary className="cursor-pointer text-sm">
                      Changed hunks since submitted review (
                      {since.data.reviewedSha.slice(0, 12)})
                    </summary>
                    <p className="text-xs text-muted-foreground">
                      Read-only comparison. Add inline comments in the current
                      PR diff below.
                    </p>
                    {since.data.changes.map((change) => (
                      <section key={change.path} className="space-y-1">
                        <h3 className="font-mono text-xs">
                          {change.previousPath
                            ? `${change.previousPath} → `
                            : ""}
                          {change.path} ({change.status})
                        </h3>
                        {change.patch ? (
                          <pre className="max-h-80 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre">
                            {change.patch}
                          </pre>
                        ) : (
                          <p className="text-xs">
                            Patch unavailable. Inspect this file in the full
                            diff.
                          </p>
                        )}
                      </section>
                    ))}
                  </details>
                )}
              {since.data?.reviewedSha && since.data.files?.length === 0 && (
                <span className="text-muted-foreground">
                  No changes since your last review.
                </span>
              )}
              {threads.data?.needsGithub && (
                <Link href="/settings/integrations" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
                  Connect GitHub to see and add comments →
                </Link>
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
              canAct={
                data.data.canAct &&
                pr.state === "open" &&
                !threads.data?.needsGithub
              }
              threads={threadsFor(f.filename)}
              pending={pending.filter((p) => p.path === f.filename)}
              onAddPending={(c) => setPending((all) => [...all, c])}
              onThreadsChanged={refreshThreads}
              highlightNew={Boolean(newSince?.has(f.filename))}
              branch={pr.headRef}
              onViewedChange={(v) => setViewed(f.filename, v)}
            />
          ))}
          <div className="pt-2 lg:hidden">
            <Checklist
              items={checklistItems}
              storageKey={`checklist:${repo}#${number}@${pr.headSha}`}
            />
          </div>
        </div>
      </div>

      {pr.state === "open" && !data.data.canAct && (
        <p className="text-muted-foreground border-t pt-3 text-sm">
          You have read-only access to this workspace.
        </p>
      )}
      {files.length > 0 && (
        <div
          className={cn(
            "fixed inset-x-4 bottom-4 z-30 flex items-center justify-between gap-2 rounded-xl border border-separator-border bg-background-primary-default p-2 text-body-2-regular shadow-overlay sm:inset-x-auto sm:end-6 sm:justify-start sm:gap-3",
            allViewed && "border-success/30",
          )}
        >
          {viewed < files.length ? (
            <>
              <span className="text-muted-foreground tabular-nums">
                <Count value={files.length - viewed} /> file
                {files.length - viewed === 1 ? "" : "s"} left
              </span>
              <ShadcnButton
                size="xs"
                type="button"
                onClick={() => nextUnviewed(currentFile())}
                className="h-7 px-3"
              >
                Next unviewed ↓
              </ShadcnButton>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                <DrawTick className="size-3.5" /> All files viewed
              </span>
              {pr.state === "open" && data.data.canAct && (
                <ShadcnButton
                  size="xs"
                  type="button"
                  onClick={() =>
                    document
                      .getElementById("review-actions")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                  className="h-7 px-3"
                >
                  Submit review
                </ShadcnButton>
              )}
            </>
          )}
          <ShadcnButton
            variant="ghost"
            type="button"
            onClick={() => setHelpOpen(true)}
            className="text-muted-foreground hover:text-foreground hover:bg-muted size-7 rounded-full text-xs transition-colors"
            aria-label="Keyboard shortcuts"
          >
            ?
          </ShadcnButton>
        </div>
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
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
                  <kbd className="bg-muted rounded border px-1.5 py-0.5 font-sans text-[11px]">
                    {k}
                  </kbd>
                </dt>
                <dd className="text-muted-foreground">{d}</dd>
              </Fragment>
            ))}
          </dl>
        </DialogContent>
      </Dialog>

      {outdatedDrafts && (
        <div role="alert" className="rounded-lg border p-3 text-sm">
          Some pending comments refer to an earlier commit. Inspect their
          locations before submission.
          {pending
            .filter((c) => c.headSha !== pr.headSha)
            .map((c) => (
              <div key={c.id} className="mt-2">
                <span>
                  {c.path}:{c.line}
                </span>
                <p className="whitespace-pre-wrap">{c.body}</p>
                <ShadcnButton
                  variant="ghost"
                  type="button"
                  className="mr-3 underline"
                  onClick={() => {
                    jumpTo(c.path);
                  }}
                >
                  Inspect file
                </ShadcnButton>
                <ShadcnButton
                  variant="ghost"
                  type="button"
                  className="mr-3 underline"
                  onClick={() =>
                    session.update((state) => ({
                      ...state,
                      pending: state.pending.map((draft) =>
                        draft.id === c.id
                          ? { ...draft, headSha: pr.headSha }
                          : draft,
                      ),
                    }))
                  }
                >
                  Confirm location for this commit
                </ShadcnButton>
                <ShadcnButton
                  variant="ghost"
                  type="button"
                  className="underline"
                  onClick={() =>
                    session.update((state) => ({
                      ...state,
                      pending: state.pending.filter(
                        (draft) => draft.id !== c.id,
                      ),
                    }))
                  }
                >
                  Discard comment
                </ShadcnButton>
              </div>
            ))}
        </div>
      )}
      {pr.state === "open" && data.data.canAct && (
        <div id="review-actions" className="scroll-mt-24">
          <ReviewActions
            repo={repo}
            number={number}
            githubLogin={me}
            needsGithub={Boolean(threads.data?.needsGithub)}
            own={Boolean(me) && pr.author.toLowerCase() === me!.toLowerCase()}
            headSha={pr.headSha}
            canMerge={!pr.draft}
            mergeableState={pr.mergeableState}
            pending={pending}
            outdatedDrafts={outdatedDrafts}
            onSubmitted={(submitted) => {
              session.update((state) => ({
                ...state,
                pending: state.pending.filter(
                  (c) =>
                    !submitted.some(
                      (sent) =>
                        sent.path === c.path &&
                        sent.line === c.line &&
                        sent.side === c.side &&
                        sent.body === c.body,
                    ),
                ),
              }));
              void refreshThreads();
              void queryClient.invalidateQueries(
                trpc.review.sinceLastReview.queryFilter({ repo, number }),
              );
            }}
            onDiscardPending={() => setPending([])}
          />
        </div>
      )}
    </div>
  );
}
