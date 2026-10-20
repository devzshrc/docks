"use client";
import { errorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { Button as ShadcnButton } from "@/components/ui/button";
import { NativeSelect as ShadcnSelect } from "@/components/ui-compat/native-select";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { commentLabel } from "@/lib/diff";

import { MentionTextarea } from "@/components/mention-textarea";
import type { PendingComment } from "@/components/review/file-diff";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toast";
import { useReviewDraft, useReviewSession } from "@/hooks/use-review-session";
import { optimistic } from "@/lib/optimistic";
import { useTRPC } from "@/trpc/react";
import { usePollInterval } from "@/hooks/use-live";

type Event = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

/** GitHub mergeable_state values that block merging, explained. */
const MERGE_STATE: Record<string, string> = {
  blocked: "Blocked by branch protection (required reviews or checks)",
  dirty: "Has merge conflicts. Resolve them on GitHub or locally.",
  behind: "Behind the base branch. Update it first.",
  draft: "Still a draft",
};

type ApproveMode = "plain" | "nits" | "auto";
const APPROVE_LABEL: Record<ApproveMode, string> = {
  plain: "Approve",
  nits: "Approve with nits",
  auto: "Approve and auto-merge",
};

/** Approve, request changes, comment, merge (§5.3). */
export function ReviewActions({
  repo,
  number,
  headSha,
  canMerge,
  githubLogin,
  needsGithub = false,
  own = false,
  mergeableState = null,
  pending = [],
  outdatedDrafts = false,
  onSubmitted,
  onDiscardPending,
}: {
  repo: string;
  number: number;
  headSha: string;
  canMerge: boolean;
  githubLogin: string | null;
  /** The server can't act on GitHub as this person yet, so every action would fail. */
  needsGithub?: boolean;
  /** GitHub refuses approvals and change requests from the PR's own author. */
  own?: boolean;
  mergeableState?: string | null;
  pending?: PendingComment[];
  outdatedDrafts?: boolean;
  onSubmitted?: (comments: PendingComment[]) => void;
  onDiscardPending?: () => void;
}) {
  const [method, setMethod] = useState<"squash" | "merge" | "rebase">("squash");
  const legacyBlocked = mergeableState
    ? MERGE_STATE[mergeableState]
    : undefined;
  const trpc = useTRPC();
  const readiness = useQuery({
    ...trpc.review.mergeReadiness.queryOptions({ repo, number }),
    staleTime: 15_000,
    refetchInterval: usePollInterval(30_000),
  });
  const blocked =
    readiness.data?.state === "blocked"
      ? readiness.data.blockers[0]?.title
      : readiness.data?.state === "ready"
        ? undefined
        : legacyBlocked;
  const queryClient = useQueryClient();
  const router = useRouter();
  const [body, setBody] = useReviewDraft(`draft:body:${repo}#${number}`);
  const session = useReviewSession();
  const [error, setError] = useState<string>();

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries(
        trpc.review.mergeReadiness.queryFilter({ repo, number }),
      ),
      queryClient.invalidateQueries(
        trpc.review.get.queryFilter({ repo, number }),
      ),
      queryClient.invalidateQueries(trpc.review.board.queryFilter()),
    ]);

  const submit = useMutation(
    trpc.review.submit.mutationOptions({
      // The comment box empties as soon as you send; it comes back if GitHub says no.

      onSuccess: (_data, vars) => {
        setBody((current) => (current === vars.body ? "" : current));
        onSubmitted?.(vars.comments ?? []);
        if (vars.event === "APPROVE" && autoAfterApprove.current) {
          autoAfterApprove.current = false;
          autoMerge.mutate({ repo, number, method });
        }
        void session.flush();
        const said =
          vars.event === "APPROVE"
            ? "Approved"
            : vars.event === "REQUEST_CHANGES"
              ? "Changes requested"
              : "Comment posted";
        // Keep a review session flowing: point at the next PR waiting on this person, from the cached board.
        const waiting = queryClient
          .getQueriesData<{
            cards: { repo: string; number: number; title: string }[];
          }>(trpc.review.board.queryFilter())
          .filter(
            ([key]) =>
              (
                key[1] as
                  | { input?: { filters?: { waitingOnMe?: boolean } } }
                  | undefined
              )?.input?.filters?.waitingOnMe,
          )
          .flatMap(([, d]) => d?.cards ?? []);
        const next = waiting.find(
          (c) => !(c.repo === repo && c.number === number),
        );
        if (vars.event === "COMMENT") toast(said);
        else if (next)
          toast(`${said}. Next up: ${next.title}`, "success", {
            label: "Open",
            onClick: () => router.push(`/review/${next.repo}/${next.number}`),
          });
        else toast(`${said}. Nothing else is waiting on you.`);
        void refresh();
      },
      onError: (e, _vars, ctx) => {
        setError(errorMessage(e));
      },
    }),
  );
  // Merging marks the PR merged and takes it off the board at once; both come back if the merge is refused.
  const merge = useMutation(
    trpc.review.merge.mutationOptions({
      ...optimistic<unknown>(
        queryClient,
        [
          {
            filter: trpc.review.get.queryFilter({ repo, number }),
            patch: (d: { pr: { state: string } }) => ({
              ...d,
              pr: { ...d.pr, state: "merged" },
            }),
          },
          {
            filter: trpc.review.board.queryFilter(),
            patch: (d: { cards: { repo: string; number: number }[] }) => ({
              ...d,
              cards: d.cards.filter(
                (c) => !(c.repo === repo && c.number === number),
              ),
            }),
          },
        ],
        { settled: () => void refresh(), onError: (e) => setError(errorMessage(e)) },
      ),
      onSuccess: () => toast("Merged"),
    }),
  );
  // "Approve with nits" says the remaining comments are optional; "auto-merge" lets GitHub merge once checks pass.
  const [approveMode, setApproveMode] = useState<ApproveMode>("plain");
  const autoAfterApprove = useRef(false);
  const autoMerge = useMutation(
    trpc.review.autoMerge.mutationOptions({
      onSuccess: () => toast("Auto-merge is on. GitHub merges once checks and required reviews pass.", "success"),
      onError: (e) => setError(errorMessage(e)),
    }),
  );
  const busy = submit.isPending || merge.isPending || autoMerge.isPending;

  // The full form sits below the diff; once it's out of view, a compact verdict bar stays on screen.
  const root = useRef<HTMLDivElement>(null);
  const [offscreen, setOffscreen] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOffscreen(!e!.isIntersecting && e!.boundingClientRect.top > 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const blockingCount = pending.filter((c) => commentLabel(c.body) === "blocking").length;
  const summary = pending.length
    ? `${pending.length} comment${pending.length > 1 ? "s" : ""}${blockingCount ? ` · ${blockingCount} blocking` : ""}`
    : null;

  if (!githubLogin || needsGithub) {
    return (
      <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 text-sm">
        <div>
          <p className="font-medium">Connect GitHub to review here</p>
          <p className="text-muted-foreground">Approvals, change requests and merges are posted to GitHub as you.</p>
        </div>
        <Button size="sm" asChild>
          <Link href="/settings/integrations">Connect GitHub</Link>
        </Button>
      </div>
    );
  }

  function send(event: Event) {
    setError(undefined);
    if (event !== "APPROVE" && !body.trim() && !pending.length) {
      setError("Add a comment first");
      return;
    }
    if (outdatedDrafts) {
      setError("Inspect outdated comment locations first");
      return;
    }
    let text = body;
    if (event === "APPROVE" && approveMode === "nits")
      text = `${body.trim() ? `${body.trim()}\n\n` : ""}Approved with nits: fine to merge once the non-blocking comments are addressed.`;
    autoAfterApprove.current = event === "APPROVE" && approveMode === "auto";
    submit.mutate({ repo, number, headSha, event, body: text, comments: pending });
  }
  const approveLabel = APPROVE_LABEL[approveMode];
  const scrollToForm = () => root.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div ref={root} className="space-y-4 rounded-md border border-separator-border bg-background-primary-default p-5">
      {offscreen && !own && (
        <div
          role="region"
          aria-label="Review verdict"
          className="animate-in fade-in slide-in-from-bottom-2 fixed bottom-4 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-2 rounded-md border border-separator-border bg-background-primary-default p-2 text-sm shadow-overlay md:flex"
        >
          <span className="text-muted-foreground px-2 tabular-nums">{summary ?? "No comments yet"}</span>
          <Button size="sm" disabled={busy} pending={submit.isPending && submit.variables?.event === "APPROVE"} onClick={() => send("APPROVE")}>
            {approveLabel}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => (body.trim() || pending.length ? send("REQUEST_CHANGES") : scrollToForm())}>
            Request changes
          </Button>
          <Button size="sm" variant="ghost" onClick={scrollToForm}>
            Write summary ↓
          </Button>
        </div>
      )}
      <section aria-label="Merge readiness" className="space-y-1 text-xs">
        <div className="flex items-center gap-2">
          <strong className="font-medium">Merge readiness</strong>
          <span
            className={cn(
              "inline-flex h-5 items-center gap-1 rounded border px-2 text-[11px]",
              readiness.data?.state === "ready"
                ? "border-(--tag-green-border) bg-(--tag-green-bg) text-(--tag-green-text)"
                : readiness.data?.state === "blocked"
                  ? "border-(--tag-red-border) bg-(--tag-red-bg) text-(--tag-red-text)"
                  : "border-(--tag-neutral-border) bg-(--tag-neutral-bg) text-(--tag-neutral-text)",
            )}
          >
            <span className="size-1.5 rounded-full bg-current" aria-hidden />
            {readiness.isPending
              ? "Checking GitHub…"
              : readiness.data?.state === "ready"
                ? "Ready"
                : readiness.data?.state === "blocked"
                  ? "Blocked"
                  : "Unable to verify"}
          </span>
          <ShadcnButton
            variant="ghost"
            type="button"
            className="underline"
            onClick={() => void readiness.refetch()}
          >
            Refresh
          </ShadcnButton>
        </div>
        {readiness.data?.blockers.map((b, i) => (
          <p key={i}>
            {b.url ? (
              <a
                href={b.url}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {b.title}
              </a>
            ) : (
              b.title
            )}
          </p>
        ))}
        {readiness.data?.warnings.map((w, i) => (
          <p key={i} className="text-muted-foreground">
            {w}
          </p>
        ))}
        <a
          href={`https://github.com/${repo}/pull/${number}`}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Inspect requirements on GitHub
        </a>
      </section>
      <MentionTextarea
        value={body}
        onChange={(v) => {
          setBody(v);
          setError(undefined);
        }}
        rows={2}
        placeholder="Leave a review comment. Type @ to mention someone."
        aria-label="Review comment"
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex">
          <Button
            size="sm"
            className="rounded-r-none"
            disabled={busy || own}
            title={own ? "You can't approve your own pull request" : undefined}
            pending={submit.isPending && submit.variables?.event === "APPROVE"}
            onClick={() => send("APPROVE")}
          >
            {approveLabel}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="rounded-l-none border-l border-white/25 px-2" disabled={busy || own} aria-label="Approval options">
                ▾
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>Approve how?</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={approveMode} onValueChange={(v) => setApproveMode(v as ApproveMode)}>
                <DropdownMenuRadioItem value="plain">
                  <span className="grid">
                    <span>Approve</span>
                    <span className="text-muted-foreground text-xs">Ready to merge as it is.</span>
                  </span>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="nits">
                  <span className="grid">
                    <span>Approve with nits</span>
                    <span className="text-muted-foreground text-xs">Merge after the optional comments, no second review.</span>
                  </span>
                </DropdownMenuRadioItem>
                {canMerge && (
                  <DropdownMenuRadioItem value="auto">
                    <span className="grid">
                      <span>Approve and auto-merge</span>
                      <span className="text-muted-foreground text-xs">GitHub merges once checks and required reviews pass.</span>
                    </span>
                  </DropdownMenuRadioItem>
                )}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || own}
          title={
            own
              ? "You can't request changes on your own pull request"
              : undefined
          }
          pending={
            submit.isPending && submit.variables?.event === "REQUEST_CHANGES"
          }
          onClick={() => send("REQUEST_CHANGES")}
        >
          Request changes
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          pending={submit.isPending && submit.variables?.event === "COMMENT"}
          onClick={() => send("COMMENT")}
        >
          Comment
        </Button>
        {canMerge && (
          // Merging is a different decision from the review verdict, so it sits apart at the far end.
          <span className="ml-auto flex items-center gap-1 border-l pl-3">
            <ShadcnSelect
              className="bg-(--field) hover:bg-(--field-hover) h-9 rounded-md border px-3 text-body-2-regular"
              aria-label="Merge method"
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              <option value="squash">Squash and merge</option>
              <option value="merge">Create a merge commit</option>
              <option value="rebase">Rebase and merge</option>
            </ShadcnSelect>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || Boolean(blocked)}
              pending={merge.isPending}
              title={blocked}
              onClick={() => {
                setError(undefined);
                merge.mutate({ repo, number, method, headSha });
              }}
            >
              Merge
            </Button>
          </span>
        )}
        {canMerge && blocked && (
          <span className="text-xs text-amber-600">{blocked}</span>
        )}
        {pending.length > 0 && (
          <span className="text-xs">
            {summary} will be sent with your review ·{" "}
            <ShadcnButton
              variant="ghost"
              type="button"
              className="underline"
              onClick={onDiscardPending}
            >
              discard
            </ShadcnButton>
          </span>
        )}
        <span className="text-muted-foreground text-xs">as {githubLogin}</span>
        {own && (
          <span className="text-muted-foreground text-xs">
            Your own PR: you can comment, but not approve or request changes.
          </span>
        )}
        {error && (
          <span role="alert" className="text-destructive text-sm">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
