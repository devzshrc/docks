"use client";
import { Badge } from "@/components/ui/badge";
import { Button as ShadcnButton } from "@/components/ui/button";

import type { BoardCard as BoardCardData } from "@docks/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconCircleCheck,
  IconCircleDot,
  IconCircleX,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import Link from "next/link";

import { GhAvatar } from "@/components/gh-avatar";
import { PrPreview } from "@/components/review/pr-preview";
import { optimistic } from "@/lib/optimistic";
import { cx as cn } from "@/utils/cx";
import { useTRPC } from "@/trpc/react";

function age(iso: string) {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "just now";
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

const CI = {
  pass: {
    icon: IconCircleCheck,
    label: "Checks passed",
    className: "text-success",
  },
  fail: {
    icon: IconCircleX,
    label: "Checks failing",
    className: "text-destructive",
  },
  pending: {
    icon: IconCircleDot,
    label: "Checks running",
    className: "text-warning",
  },
} as const;

/** One PR card. Hierarchy: repo, title, who/when, then a footer of small pills. Actions appear on hover. */
export function BoardCard({
  pr,
  canAct,
}: {
  pr: BoardCardData;
  canAct: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const priority = useMutation(
    trpc.review.setPriority.mutationOptions(
      optimistic<{ repo: string; number: number; priority: boolean }>(
        queryClient,
        [
          {
            filter: trpc.review.board.queryFilter(),
            patch: (d: { cards: BoardCardData[] }, v) => ({
              ...d,
              cards: d.cards.map((c) =>
                c.repo === v.repo && c.number === v.number
                  ? { ...c, priority: v.priority }
                  : c,
              ),
            }),
          },
        ],
      ),
    ),
  );
  // Start loading the PR as the pointer arrives, so the click opens it already filled in.
  const prefetch = () =>
    void queryClient.prefetchQuery(
      trpc.review.get.queryOptions({ repo: pr.repo, number: pr.number }),
    );
  const ci = pr.ci === "none" ? null : CI[pr.ci];

  return (
    <div
      className={cn(
        "group relative rounded-md border border-separator-border bg-background-primary-default p-4 text-body-2-regular transition-colors hover:border-primary/30 focus-within:ring-2 focus-within:ring-border-focus-ring/30",
      )}
    >
      {canAct && (
        <ShadcnButton
          variant="ghost"
          type="button"
          className={cn(
            "text-muted-foreground hover:text-foreground absolute top-3 right-3 z-10 transition-opacity duration-150 focus-visible:opacity-100",
            pr.priority
              ? "opacity-100"
              : "opacity-100 md:opacity-0 md:group-hover:opacity-100",
          )}
          aria-label={pr.priority ? "Remove priority" : "Mark as priority"}
          aria-pressed={pr.priority}
          disabled={priority.isPending}
          onClick={() =>
            priority.mutate({
              repo: pr.repo,
              number: pr.number,
              priority: !pr.priority,
            })
          }
        >
          {pr.priority ? (
            <IconStarFilled className="anim-pop size-4 text-warning" />
          ) : (
            <IconStar className="size-4" />
          )}
        </ShadcnButton>
      )}
      <PrPreview repo={pr.repo} number={pr.number}>
        <Link
          href={`/review/${pr.repo}/${pr.number}`}
          onMouseEnter={prefetch}
          onFocus={prefetch}
          data-card
          className="block outline-none after:absolute after:inset-0 after:content-['']"
        >
          <div className="truncate pe-6 text-caption-1-regular text-text-secondary">
            {pr.repo}
          </div>
          <div className="mt-2 line-clamp-2 pe-6 text-body-2-medium text-text-primary">
            <span className="text-text-3 font-normal">#{pr.number}</span>{" "}
            {pr.title}
          </div>
        </Link>
      </PrPreview>
      <div className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
        <GhAvatar
          login={pr.author.login}
          src={pr.author.avatar_url}
          className="size-4 text-[9px]"
        />
        <span className="min-w-0 truncate">{pr.author.login}</span>
        <span className="text-text-3 shrink-0 whitespace-nowrap">
          · {age(pr.updatedAt)}
        </span>
        {ci && (
          <ci.icon
            className={cn("ml-auto size-4 shrink-0", ci.className)}
            aria-label={ci.label}
          />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge
          variant="secondary"
          className=""
          title={`${pr.additions + pr.deletions} lines changed`}
        >
          {pr.size}
          <span className="text-success-text tabular-nums">
            +{pr.additions}
          </span>
          <span className="text-danger-text tabular-nums">−{pr.deletions}</span>
        </Badge>
        {pr.stuck && (
          <Badge variant="secondary" className="" data-tone="warning">
            Stuck
          </Badge>
        )}
        {pr.claimedBy && (
          <Badge variant="secondary" className="">
            {pr.claimedBy.name} is on it
          </Badge>
        )}
        {pr.labels.map((l) => (
          <Badge variant="secondary" key={l} className="" data-tone="info">
            {l}
          </Badge>
        ))}
        {pr.reviewers.length > 0 && (
          <span className="ml-auto flex -space-x-1.5">
            {pr.reviewers.slice(0, 3).map((r) => (
              <GhAvatar
                key={r.login}
                login={r.login}
                className="ring-card ring-2"
              />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
