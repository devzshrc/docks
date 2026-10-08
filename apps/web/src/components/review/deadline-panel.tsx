"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useWorkspace } from "@/hooks/use-workspace";
import { BackupReviewer } from "./backup-reviewer";
import { EvidenceExport } from "./evidence-export";
export function DeadlinePanel({
  repo,
  number,
}: {
  repo: string;
  number: number;
}) {
  const trpc = useTRPC();
  const { workspace } = useWorkspace();
  const cycles = useQuery({
    ...trpc.delivery.prCycles.queryOptions({ repo, number }),
    refetchInterval: 60000,
  });
  const manage = workspace && ["owner", "admin"].includes(workspace.role);
  return (
    <section
      aria-label="Review deadlines"
      className="space-y-2 rounded-lg border p-3 text-sm"
    >
      <div className="flex justify-between">
        <strong>Review deadlines</strong>
        <Link className="underline" href="/deadlines">
          Policies and overdue reviews
        </Link>
      </div>
      {cycles.error && <p role="alert">{cycles.error.message}</p>}
      {cycles.data?.length === 0 && (
        <p className="text-muted-foreground">No active deadline for this PR.</p>
      )}
      {cycles.data?.map((cycle) => (
        <div key={cycle.id} className="space-y-2">
          <p>
            {cycle.kind === "first"
              ? "First review"
              : `Review by ${cycle.reviewer}`}{" "}
            ·{" "}
            {cycle.pausedAt
              ? "Paused while draft"
              : cycle.dueAt.getTime() <= Date.now()
                ? "Overdue"
                : "Due"}{" "}
            {cycle.dueAt.toLocaleString()} ({cycle.rules.schedule.timezone})
          </p>
          {manage && !cycle.pausedAt && cycle.dueAt.getTime() <= Date.now() && (
            <BackupReviewer
              repo={repo}
              number={number}
              cycleId={cycle.id}
              assigned={cycle.backupLogin}
            />
          )}
        </div>
      ))}
      {manage && (
        <EvidenceExport workspaceId={workspace.id} prs={[{ repo, number }]} />
      )}
    </section>
  );
}
