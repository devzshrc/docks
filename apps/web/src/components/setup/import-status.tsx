"use client";
import { useQuery } from "@tanstack/react-query";
import { ButtonLink } from "@/components/base/buttons/button";
import { useTRPC } from "@/trpc/react";

/** No percentage until GitHub has enumerated all PRs; re-syncs can overlap imported PRs. */
export function ImportStatus({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const progress = useQuery({
    ...trpc.setup.importProgress.queryOptions({ workspaceId }),
    refetchInterval: (q) =>
      q.state.data?.pending || q.state.data?.discovering ? 3000 : 30_000,
  });
  const d = progress.data;
  if (!d || (!d.pending && !d.discovering && !d.rateLimited)) return null;
  return (
    <section
      role="status"
      aria-label="GitHub import progress"
      className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border-button-default bg-background-secondary-default p-4"
    >
      <div className="grid gap-2 text-body-regular text-text-secondary">
        <p>
          {d.rateLimited
            ? `GitHub is limiting background syncs until ${new Date(d.rateLimited.resetAt).toLocaleTimeString()}. Some data may be a few minutes old.`
            : d.discovering
              ? "Finding existing pull requests on GitHub…"
              : "Syncing pull requests from GitHub…"}
        </p>
        <p>
          {d.imported} open pull requests imported · {d.pending} syncs
          remaining. You can keep using Docks.
        </p>
        {(d.pending > 0 || d.discovering > 0) && (
          <progress aria-label="Import in progress" className="h-1 w-full" />
        )}
      </div>
      <ButtonLink size="small" variant="secondary" href="/settings/setup">
        Check setup
      </ButtonLink>
    </section>
  );
}
