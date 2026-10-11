"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { RiInbox2Line } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTRPC } from "@/trpc/react";

const views = {
  needs_review: "Needs my review",
  changed: "Changes since my review",
  my_prs: "My PRs",
  overdue: "Overdue",
  snoozed: "Snoozed",
} as const;
export function PersonalReviewInbox({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const [view, setView] = useState<keyof typeof views>("needs_review");
  const [page, setPage] = useState(0);
  const q = useQuery({
    ...trpc.reviewInbox.list.queryOptions({ workspaceId, view, page }),
    refetchInterval: 30000,
  });
  const snooze = useMutation(
    trpc.reviewInbox.snooze.mutationOptions({
      onSuccess: () => client.invalidateQueries(trpc.reviewInbox.pathFilter()),
    }),
  );
  const claim = useMutation(
    trpc.review.claim.mutationOptions({
      onSuccess: () => client.invalidateQueries(),
    }),
  );
  return (
    <section className="flex flex-col gap-4" aria-label="Personal review inbox">
      <Tabs
        value={view}
        onValueChange={(v) => {
          setView(v as keyof typeof views);
          setPage(0);
        }}
      >
        <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList aria-label="Inbox views">
            {Object.entries(views).map(([key, label]) => (
              <TabsTrigger key={key} value={key} className="px-3.5">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {q.isPending && (
        <div role="status" aria-label="Loading reviews" className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[76px] rounded-xl" />
          ))}
        </div>
      )}
      {q.error && (
        <p role="alert" className="text-text-error-primary">
          {q.error.message}
        </p>
      )}
      {snooze.error && (
        <p role="alert" className="text-text-error-primary">
          {snooze.error.message}
        </p>
      )}
      {claim.error && (
        <p role="alert" className="text-text-error-primary">
          {claim.error.message}
        </p>
      )}
      {q.data?.items.length === 0 && (
        <div className="animate-in fade-in flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-12 text-center shadow-card duration-200">
          <span className="grid size-9 place-items-center rounded-full bg-muted text-subtle">
            <RiInbox2Line className="size-4" aria-hidden />
          </span>
          <div className="grid gap-1">
            <p className="text-sm font-medium text-foreground">You're all caught up</p>
            <p className="text-sm text-muted-foreground">Nothing in {views[view].toLowerCase()} right now.</p>
          </div>
        </div>
      )}
      <ul className="stagger flex flex-col gap-2">
        {q.data?.items.map((pr) => (
          <li
            key={`${pr.repo}#${pr.number}`}
            className="group flex flex-wrap items-center gap-3 rounded-xl bg-card p-4 shadow-card transition-shadow duration-150 hover:shadow-[0_0_0_1px_rgb(15_23_42/0.09),0_2px_4px_0_rgb(15_23_42/0.05),0_10px_24px_-10px_rgb(15_23_42/0.14)]"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link
                className="truncate text-sm font-medium text-foreground decoration-foreground/30 underline-offset-4 hover:underline"
                href={`/review/${pr.repo}/${pr.number}`}
              >
                {pr.title}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{pr.repo} #{pr.number}</span>{" "}·{" "}
                {pr.draft ? "Draft" : pr.column.replaceAll("_", " ")} ·{" "}
                {pr.requestedReviewers.join(", ") || "No reviewer requested"}
              </p>
              <p className="text-xs text-subtle">
                Synced {pr.syncedAt.toLocaleString()}
              </p>
            </div>
            {view !== "my_prs" && !pr.claimedBy && (
              <Button
                size="sm"
                disabled={claim.isPending}
                onClick={() =>
                  claim.mutate({
                    repo: pr.repo,
                    number: pr.number,
                    claim: true,
                  })
                }
              >
                Accept review
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={snooze.isPending}
              onClick={() =>
                snooze.mutate({
                  repo: pr.repo,
                  number: pr.number,
                  until:
                    view === "snoozed" ? null : new Date(Date.now() + 86400000),
                })
              }
            >
              {view === "snoozed" ? "Unsnooze" : "Snooze 1 day"}
            </Button>
          </li>
        ))}
      </ul>
      {(page > 0 || q.data?.more) && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={!page} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={!q.data?.more} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </section>
  );
}
