"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/base/buttons/button";
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
      <div className="flex flex-wrap gap-2">
        {Object.entries(views).map(([key, label]) => (
          <Button
            key={key}
            variant={view === key ? "primary" : "secondary"}
            aria-pressed={view === key}
            onClick={() => {
              setView(key as keyof typeof views);
              setPage(0);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {q.isPending && <p role="status">Loading reviews…</p>}
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
        <p className="text-body-regular text-text-secondary">
          No reviews in this view.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {q.data?.items.map((pr) => (
          <li
            key={`${pr.repo}#${pr.number}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border-button-default p-4"
          >
            <div className="flex flex-col gap-1">
              <Link
                className="text-body-medium text-text-primary underline"
                href={`/review/${pr.repo}/${pr.number}`}
              >
                {pr.title}
              </Link>
              <p className="text-caption-1-regular text-text-secondary">
                {pr.repo} #{pr.number} ·{" "}
                {pr.draft ? "Draft" : pr.column.replaceAll("_", " ")} ·{" "}
                {pr.requestedReviewers.join(", ") || "No reviewer requested"}
              </p>
              <p className="text-caption-1-regular text-text-tertiary">
                Synced {pr.syncedAt.toLocaleString()}
              </p>
            </div>
            {view !== "my_prs" && !pr.claimedBy && (
              <Button
                variant="secondary"
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
              variant="secondary"
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
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={!page}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={!q.data?.more}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
