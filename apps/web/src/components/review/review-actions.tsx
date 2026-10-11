"use client";
import { cn } from "@/lib/utils";
import { Button as ShadcnButton } from "@/components/ui/button";
import { NativeSelect as ShadcnSelect } from "@/components/ui-compat/native-select";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { MentionTextarea } from "@/components/mention-textarea";
import type { PendingComment } from "@/components/review/file-diff";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toast";
import { useReviewDraft, useReviewSession } from "@/hooks/use-review-session";
import { optimistic } from "@/lib/optimistic";
import { useTRPC } from "@/trpc/react";

type Event = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

/** GitHub mergeable_state values that block merging, explained. */
const MERGE_STATE: Record<string, string> = {
  blocked: "Blocked by branch protection (required reviews or checks)",
  dirty: "Has merge conflicts. Resolve them on GitHub or locally.",
  behind: "Behind the base branch. Update it first.",
  draft: "Still a draft",
};

/** Approve, request changes, comment, merge (§5.3). */
export function ReviewActions({
  repo,
  number,
  headSha,
  canMerge,
  githubLogin,
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
    refetchInterval: 30_000,
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
        setError(e.message);
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
        { settled: () => void refresh(), onError: (e) => setError(e.message) },
      ),
      onSuccess: () => toast("Merged"),
    }),
  );
  const busy = submit.isPending || merge.isPending;

  if (!githubLogin) {
    return (
      <div className="bg-background sticky bottom-0 border-t p-3 text-sm">
        <Link href="/settings/integrations" className="underline">
          Connect your GitHub account
        </Link>{" "}
        to review and merge from here.
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
    submit.mutate({ repo, number, headSha, event, body, comments: pending });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-separator-border bg-background-primary-default p-5">
      <section aria-label="Merge readiness" className="space-y-1 text-xs">
        <div className="flex items-center gap-2">
          <strong className="font-medium">Merge readiness</strong>
          <span
            className={cn(
              "inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px]",
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
        <Button
          size="sm"
          disabled={busy || own}
          title={own ? "You can't approve your own pull request" : undefined}
          pending={submit.isPending && submit.variables?.event === "APPROVE"}
          onClick={() => send("APPROVE")}
        >
          Approve
        </Button>
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
          <span className="flex items-center gap-1">
            <ShadcnSelect
              className="bg-(--field) hover:bg-(--field-hover) h-9 rounded-lg border px-3 text-body-2-regular"
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
            {pending.length} pending comment{pending.length > 1 ? "s" : ""} will
            be sent with your review ·{" "}
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
