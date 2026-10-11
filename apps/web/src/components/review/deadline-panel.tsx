"use client";
import { RiTimeLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { BackupReviewer } from "./backup-reviewer";
import { EvidenceExport } from "./evidence-export";
import { SideSection } from "./side-section";

/** "in 3h" / "6h ago", short and scannable; the exact time sits in the title. */
function relative(d: Date) {
  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  const abs = Math.abs(mins);
  const span = abs < 60 ? `${abs}m` : abs < 1440 ? `${Math.round(abs / 60)}h` : `${Math.round(abs / 1440)}d`;
  return mins >= 0 ? `in ${span}` : `${span} ago`;
}

export function DeadlinePanel({ repo, number }: { repo: string; number: number }) {
  const trpc = useTRPC();
  const { workspace } = useWorkspace();
  const cycles = useQuery({
    ...trpc.delivery.prCycles.queryOptions({ repo, number }),
    refetchInterval: 60000,
  });
  const manage = workspace && ["owner", "admin"].includes(workspace.role);
  return (
    <>
      <SideSection
        label="Deadline"
        action={
          <Link href="/deadlines" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
            Policies
          </Link>
        }
      >
        {cycles.error && (
          <p role="alert" className="text-sm text-danger">
            {cycles.error.message}
          </p>
        )}
        {cycles.data?.length === 0 && <p className="text-sm text-muted-foreground">No deadline on this pull request.</p>}
        <ul className="grid gap-2">
          {cycles.data?.map((cycle) => {
            const overdue = !cycle.pausedAt && cycle.dueAt.getTime() <= Date.now();
            const status = cycle.pausedAt ? "Paused" : overdue ? "Overdue" : "Due";
            return (
              <li key={cycle.id} className="grid gap-2 rounded-xl bg-muted/50 p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">
                    {cycle.kind === "first" ? "First review" : `Review by ${cycle.reviewer}`}
                  </span>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                      overdue ? "bg-danger/10 text-danger" : cycle.pausedAt ? "bg-muted text-muted-foreground" : "bg-warning/10 text-warning",
                    )}
                  >
                    <span className="size-1.5 rounded-full bg-current" aria-hidden />
                    {status}
                  </span>
                </div>
                <p
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  title={`${cycle.dueAt.toLocaleString()} (${cycle.rules.schedule.timezone})`}
                >
                  <RiTimeLine className="size-3.5" aria-hidden />
                  {cycle.pausedAt ? "Paused while the pull request is a draft" : `${overdue ? "Was due" : "Due"} ${relative(cycle.dueAt)}`}
                </p>
                {manage && !cycle.pausedAt && overdue && (
                  <BackupReviewer repo={repo} number={number} cycleId={cycle.id} assigned={cycle.backupLogin} />
                )}
              </li>
            );
          })}
        </ul>
      </SideSection>
      {manage && (
        <SideSection label="Evidence">
          <EvidenceExport workspaceId={workspace.id} prs={[{ repo, number }]} />
        </SideSection>
      )}
    </>
  );
}
