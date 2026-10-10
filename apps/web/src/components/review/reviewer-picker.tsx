"use client";
import { Button as ShadcnButton } from "@/components/ui/button";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconHandStop, IconPlus, IconX } from "@tabler/icons-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { optimistic } from "@/lib/optimistic";
import { useTRPC } from "@/trpc/react";

/** Requested reviewers, add/remove with suggestions, and "I'm on it" (plan M4). */
export function ReviewerPicker({
  repo,
  number,
}: {
  repo: string;
  number: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = useQuery(
    trpc.review.reviewerOptions.queryOptions({ repo, number }),
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries(
        trpc.review.reviewerOptions.queryFilter({ repo, number }),
      ),
      queryClient.invalidateQueries(
        trpc.review.get.queryFilter({ repo, number }),
      ),
      queryClient.invalidateQueries(trpc.review.board.queryFilter()),
    ]);
  type Options = NonNullable<typeof options.data>;
  const optionsFilter = trpc.review.reviewerOptions.queryFilter({
    repo,
    number,
  });
  // Reviewers and "I'm on it" change on screen at once; the refresh below reconciles with GitHub.
  const setReviewers = useMutation(
    trpc.review.setReviewers.mutationOptions({
      ...optimistic<{ add?: string[]; remove?: string[] }>(
        queryClient,
        [
          {
            filter: optionsFilter,
            patch: (d: Options, v) => {
              const added = d.suggestions
                .filter((s) => v.add?.includes(s.login))
                .map((s) => ({
                  login: s.login,
                  name: s.name as string | null,
                }));
              return {
                ...d,
                requested: [
                  ...d.requested.filter((r) => !v.remove?.includes(r.login)),
                  ...added,
                ],
                suggestions: d.suggestions.filter(
                  (s) => !v.add?.includes(s.login),
                ),
              };
            },
          },
        ],
        { settled: () => void refresh(), onError: (e) => setError(e.message) },
      ),
    }),
  );
  const claim = useMutation(
    trpc.review.claim.mutationOptions({
      ...optimistic<{ claim: boolean }>(
        queryClient,
        [
          {
            filter: optionsFilter,
            patch: (d: Options, v) => ({
              ...d,
              claimedBy: v.claim
                ? { userId: "me", name: "You", isMe: true }
                : null,
            }),
          },
        ],
        { settled: () => void refresh(), onError: (e) => setError(e.message) },
      ),
    }),
  );

  if (!options.data) return null;
  const { requested, suggestions, claimedBy, canAct } = options.data;
  const busy = setReviewers.isPending || claim.isPending;

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        {requested.length === 0 && (
          <span className="text-muted-foreground">nobody yet</span>
        )}
        {requested.map((r) => (
          <Badge key={r.login} variant="outline" className="gap-1">
            {r.name ?? r.login}
            {canAct && (
              <ShadcnButton
                variant="ghost"
                type="button"
                aria-label={`Remove ${r.login}`}
                disabled={busy}
                onClick={() => {
                  setError(undefined);
                  setReviewers.mutate({ repo, number, remove: [r.login] });
                }}
              >
                <IconX className="size-3" aria-hidden />
              </ShadcnButton>
            )}
          </Badge>
        ))}
        {canAct && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <IconPlus className="size-4" aria-hidden />
            Add reviewer
          </Button>
        )}
        {claimedBy && (
          <Badge variant="secondary" className="gap-1">
            <IconHandStop className="size-3" aria-hidden />
            {claimedBy.isMe ? "You're on it" : `${claimedBy.name} is on it`}
          </Badge>
        )}
        {canAct && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={
              busy ||
              Boolean(
                claimedBy && !claimedBy.isMe && !options.data?.canReassign,
              )
            }
            onClick={() => {
              setError(undefined);
              claim.mutate({
                repo,
                number,
                claim: !claimedBy?.isMe,
                expectedOwner: claimedBy?.userId,
              });
            }}
          >
            {claimedBy?.isMe
              ? "Release"
              : claimedBy
                ? "Take over"
                : "Accept review"}
          </Button>
        )}
        {canAct &&
          options.data?.myLogin &&
          requested.some(
            (r) =>
              r.login.toLowerCase() === options.data!.myLogin!.toLowerCase(),
          ) &&
          !claimedBy?.isMe && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                setReviewers.mutate({
                  repo,
                  number,
                  remove: [options.data!.myLogin!],
                })
              }
            >
              Decline review
            </Button>
          )}
      </div>
      {open && (
        <ul
          className="max-w-md divide-y rounded-md border"
          aria-label="Suggested reviewers"
        >
          {suggestions.length === 0 && (
            <li className="text-muted-foreground px-3 py-2">
              No one else can review this yet. Teammates need a linked GitHub
              account and access to the repo.
            </li>
          )}
          {suggestions.map((s) => (
            <li
              key={s.login}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="font-medium">{s.name}</span>{" "}
                <span className="text-muted-foreground">@{s.login}</span>
                <span className="text-muted-foreground block text-xs">
                  {[
                    ...s.reasons,
                    `${s.openReviews} open review${s.openReviews === 1 ? "" : "s"}`,
                  ].join(" · ")}
                  {s.atLimit && (
                    <span className="text-amber-600">
                      {" "}
                      · at their review limit
                    </span>
                  )}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setError(undefined);
                  setReviewers.mutate({ repo, number, add: [s.login] });
                  setOpen(false);
                }}
              >
                Request
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}
