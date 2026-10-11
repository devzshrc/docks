"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { QueryError } from "@/components/query-state";
import { Button } from "@/components/ui/button";

export function BackupReviewer({
  repo,
  number,
  cycleId,
  assigned,
}: {
  repo: string;
  number: number;
  cycleId: string;
  assigned: string | null;
}) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const candidates = useQuery({
    ...trpc.delivery.backups.queryOptions({ repo, number }),
    enabled: open,
  });
  const request = useMutation(
    trpc.delivery.requestBackup.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          client.invalidateQueries(trpc.delivery.cycles.queryFilter()),
          client.invalidateQueries(trpc.delivery.prCycles.queryFilter()),
          client.invalidateQueries(trpc.delivery.backups.queryFilter()),
          client.invalidateQueries(trpc.review.get.queryFilter()),
        ]);
        setOpen(false);
      },
    }),
  );
  if (assigned)
    return (
      <span className="text-xs text-muted-foreground">
        Backup requested from <span className="font-medium text-foreground">@{assigned}</span>
      </span>
    );
  return (
    <div className="space-y-2">
      <Button size="xs" variant="outline" onClick={() => setOpen(!open)} className="w-fit">
        {open ? "Cancel" : "Choose a backup reviewer"}
      </Button>
      {open && (
        <div className="animate-in fade-in slide-in-from-top-1 space-y-2 rounded-lg bg-card p-3 text-sm shadow-control duration-150">
          <p className="text-xs text-muted-foreground">
            Keep the original reviewer requested. Suggestions do not guarantee
            required code-owner approval. GitHub team ownership is not
            evaluated.
          </p>
          {candidates.isPending && <p>Finding available reviewers…</p>}
          {(candidates.error || request.error) && (
            <QueryError error={(candidates.error ?? request.error)!} />
          )}
          {candidates.data?.length === 0 && (
            <p>
              No suitable backup is available. Ask the lead to choose a reviewer
              on GitHub.
            </p>
          )}
          {candidates.data?.map((c) => (
            <div
              key={c.userId}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span>
                {c.name} ({c.login})
                <span className="block text-xs text-muted-foreground">
                  {c.reasons.join(", ") || "Available workspace member"} ·{" "}
                  {c.openReviews} open reviews
                </span>
              </span>
              <Button
                size="sm"
                disabled={request.isPending}
                onClick={() => request.mutate({ cycleId, login: c.login })}
              >
                Request backup review
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
