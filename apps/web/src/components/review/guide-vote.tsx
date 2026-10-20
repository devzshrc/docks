"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconThumbDown, IconThumbUp } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

export type GuideFeedback = {
  votes: Record<string, 1 | -1>;
  cast: (item: string, vote: 1 | -1) => void;
};

/** The signed-in reviewer's thumbs on this commit's AI guide. Null when there's nothing to vote on. */
export function useGuideFeedback({
  repo,
  number,
  headSha,
  enabled,
}: {
  repo: string;
  number: number;
  headSha: string;
  enabled: boolean;
}): GuideFeedback | null {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const key = { repo, number, headSha };
  const votes = useQuery(trpc.review.guideVotes.queryOptions(key, { enabled }));
  const save = useMutation(
    trpc.review.guideFeedback.mutationOptions({
      onMutate: ({ item, vote }) =>
        queryClient.setQueryData(trpc.review.guideVotes.queryKey(key), (prev) => {
          const next = { ...prev };
          if (vote === 0) delete next[item];
          else next[item] = vote;
          return next;
        }),
      onError: () => queryClient.invalidateQueries({ queryKey: trpc.review.guideVotes.queryKey(key) }),
    }),
  );
  if (!enabled) return null;
  const current = votes.data ?? {};
  return {
    votes: current,
    // Clicking the active thumb again clears it.
    cast: (item, vote) => save.mutate({ ...key, item, vote: current[item] === vote ? 0 : vote }),
  };
}

export function VoteButtons({
  feedback,
  item,
  label,
}: {
  feedback: GuideFeedback;
  item: string;
  label: string;
}) {
  const value = feedback.votes[item];
  const button = (vote: 1 | -1) => {
    const Icon = vote === 1 ? IconThumbUp : IconThumbDown;
    const on = value === vote;
    return (
      <button
        type="button"
        aria-label={`${vote === 1 ? "Helpful" : "Not helpful"}: ${label}`}
        aria-pressed={on}
        onClick={(e) => {
          e.stopPropagation();
          feedback.cast(item, vote);
        }}
        className={cn(
          "grid size-5 place-items-center rounded transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
          on ? "text-foreground" : "text-subtle hover:text-foreground",
        )}
      >
        <Icon className="size-3.5" aria-hidden fill={on ? "currentColor" : "none"} />
      </button>
    );
  };
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {button(1)}
      {button(-1)}
    </span>
  );
}
