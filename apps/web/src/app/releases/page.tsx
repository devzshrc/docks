"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/query-state";
import { EvidenceExport } from "@/components/review/evidence-export";
import { useWorkspace } from "@/hooks/use-workspace";
import { useTRPC } from "@/trpc/react";
function Detail({
  id,
  workspaceId,
  manage,
  paid,
}: {
  id: string;
  workspaceId: string;
  manage: boolean;
  paid: boolean;
}) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const [pick, setPick] = useState("");
  const report = useQuery({
    ...trpc.releases.get.queryOptions({ id }),
    refetchInterval: 10000,
  });
  const candidates = useQuery({
    ...trpc.releases.candidates.queryOptions({ workspaceId }),
    enabled: manage && paid,
  });
  const invalidate = () =>
    Promise.all([
      client.invalidateQueries(trpc.releases.get.queryFilter({ id })),
      client.invalidateQueries(trpc.releases.list.queryFilter()),
    ]);
  const setPr = useMutation(
    trpc.releases.setPr.mutationOptions({ onSuccess: invalidate }),
  );
  const refresh = useMutation(
    trpc.releases.refresh.mutationOptions({ onSuccess: invalidate }),
  );
  const update = useMutation(
    trpc.releases.update.mutationOptions({ onSuccess: invalidate }),
  );
  if (report.isPending) return <p>Loading release…</p>;
  if (report.error) return <QueryError error={report.error} />;
  const { release, items, incomplete } = report.data;
  const error =
    setPr.error ?? refresh.error ?? update.error ?? candidates.error;
  const ready =
    !incomplete &&
    items.length > 0 &&
    items.every(
      (r) => r.pr.state === "merged" || (r.pr.state === "open" && r.readiness.state === "ready"),
    );
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">{release.name}</h2>
          <p className="text-sm">
            {release.status} · {ready ? "Ready to merge" : "Review required"}
            {release.targetDate &&
              ` · Target ${release.targetDate.toLocaleDateString()}`}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!paid || refresh.isPending}
          onClick={() => refresh.mutate({ id })}
        >
          Refresh GitHub requirements
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Results expire after 15 minutes or a changed commit. Merged PRs remain
        visible. Ready means merge requirements passed when checked.
      </p>
      {incomplete && (
        <p role="alert">
          This report is incomplete because some repositories are outside your
          access.
        </p>
      )}
      {error && <QueryError error={error} />}
      {items.length === 0 && <p>No visible PRs in this release.</p>}
      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={`${item.pr.repoId}:${item.pr.number}`}
            className="space-y-2 rounded border p-3"
          >
            <div className="flex justify-between gap-3">
              <Link
                className="font-medium underline"
                href={`/review/${item.repo}/${item.pr.number}`}
              >
                {item.repo} #{item.pr.number}: {item.pr.title}
              </Link>
              {manage && (
                <button
                  type="button"
                  className="text-xs underline"
                  disabled={!paid || setPr.isPending}
                  onClick={() =>
                    setPr.mutate({
                      id,
                      repo: item.repo,
                      number: item.pr.number,
                      included: false,
                    })
                  }
                >
                  Remove from release
                </button>
              )}
            </div>
            <p className="text-sm">
              {item.pr.state === "merged"
                ? "Merged"
                : item.pr.state === "closed"
                  ? "Closed without merge"
                  : item.readiness.state === "unknown"
                    ? "Unknown"
                    : item.readiness.state === "ready"
                      ? "Ready"
                      : "Blocked"}{" "}
              · Author: {item.pr.authorLogin} · Reviewers:{" "}
              {item.pr.requestedReviewers.join(", ") || "None requested"}
            </p>
            <p className="font-mono text-xs">
              Commit {item.pr.headSha.slice(0, 12)} · Checked{" "}
              {item.readiness.checkedAt
                ? new Date(item.readiness.checkedAt).toLocaleString()
                : "Never"}
            </p>
            {item.pr.state === "open" && (
              <ul className="text-sm">
                {item.readiness.blockers.map((blocker, i) => (
                  <li key={i}>
                    {blocker.url ? (
                      <a
                        className="underline"
                        href={blocker.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {blocker.title}
                      </a>
                    ) : (
                      blocker.title
                    )}{" "}
                    · Next:{" "}
                    {blocker.kind === "review" ||
                    blocker.kind === "conversation"
                      ? "Reviewer and author"
                      : item.pr.authorLogin}
                  </li>
                ))}
                {item.readiness.warnings.map((warning, i) => (
                  <li className="text-muted-foreground" key={`w${i}`}>
                    {warning}
                  </li>
                ))}
              </ul>
            )}
            {item.cycles.map((cycle) => (
              <p key={cycle.id} className="text-xs">
                {cycle.kind === "first" ? "First review" : cycle.reviewer} ·{" "}
                {cycle.pausedAt ? "Paused" : "Due"}{" "}
                {cycle.dueAt.toLocaleString()}
              </p>
            ))}
          </article>
        ))}
      </div>
      {manage && paid && (
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Add pull request to release"
            className="bg-background rounded border p-2 text-sm"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">Choose a PR</option>
            {candidates.data
              ?.filter(
                (c) =>
                  !items.some(
                    (i) => i.pr.repoId === c.repoId && i.pr.number === c.number,
                  ),
              )
              .map((c) => (
                <option
                  key={`${c.repoId}:${c.number}`}
                  value={`${c.repo}:${c.number}`}
                >
                  {c.repo} #{c.number}: {c.title}
                </option>
              ))}
          </select>
          <Button
            size="sm"
            disabled={!pick || setPr.isPending}
            onClick={() => {
              const split = pick.lastIndexOf(":");
              setPr.mutate({
                id,
                repo: pick.slice(0, split),
                number: Number(pick.slice(split + 1)),
                included: true,
              });
            }}
          >
            Add PR
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={update.isPending}
            onClick={() =>
              update.mutate({
                id,
                name: release.name,
                targetDate: release.targetDate,
                status: release.status === "active" ? "completed" : "active",
              })
            }
          >
            {release.status === "active"
              ? "Mark release completed"
              : "Reopen release"}
          </Button>
        </div>
      )}
      {manage && (
        <EvidenceExport
          workspaceId={workspaceId}
          prs={items.map((item) => ({
            repo: item.repo,
            number: item.pr.number,
          }))}
        />
      )}
    </section>
  );
}
function Releases({
  workspaceId,
  manage,
}: {
  workspaceId: string;
  manage: boolean;
}) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const [selected, setSelected] = useState<string>();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const list = useQuery(trpc.releases.list.queryOptions({ workspaceId }));
  const policy = useQuery(trpc.delivery.policies.queryOptions({ workspaceId }));
  const paid = policy.data?.plan === "team";
  const create = useMutation(
    trpc.releases.create.mutationOptions({
      onSuccess: async (release) => {
        setSelected(release.id);
        setName("");
        setDate("");
        await client.invalidateQueries(
          trpc.releases.list.queryFilter({ workspaceId }),
        );
      },
    }),
  );
  return (
    <div className="space-y-5">
      <p>
        Track the PRs for a release, inspect blockers, and export collected
        review evidence.
      </p>
      {policy.data?.plan === "free" && (
        <p>
          Release changes, refreshes, and exports require the{" "}
          <Link className="underline" href="/settings/billing">
            Team plan
          </Link>
          . Existing reports remain readable.
        </p>
      )}
      {(list.error || policy.error || create.error) && (
        <QueryError error={(list.error ?? policy.error ?? create.error)!} />
      )}
      {manage && paid && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({
              workspaceId,
              name,
              targetDate: date ? new Date(`${date}T12:00:00Z`) : null,
            });
          }}
        >
          <input
            aria-label="Release name"
            placeholder="Release name"
            className="bg-background rounded border p-2"
            maxLength={100}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            aria-label="Release target date"
            type="date"
            className="bg-background rounded border p-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Button type="submit" disabled={create.isPending}>
            Create release
          </Button>
        </form>
      )}
      {list.isPending && <p>Loading releases…</p>}
      {list.data?.length === 0 && <p>No releases yet.</p>}
      <div className="flex flex-wrap gap-2">
        {list.data?.map((release) => (
          <Button
            key={release.id}
            variant={selected === release.id ? "default" : "outline"}
            onClick={() => setSelected(release.id)}
          >
            {release.name}
          </Button>
        ))}
      </div>
      {selected && (
        <Detail
          key={selected}
          id={selected}
          workspaceId={workspaceId}
          manage={manage}
          paid={paid}
        />
      )}
    </div>
  );
}
export default function Page() {
  const { workspace } = useWorkspace();
  return (
    <AppShell title="Releases">
      {workspace ? (
        <Releases
          key={workspace.id}
          workspaceId={workspace.id}
          manage={["owner", "admin"].includes(workspace.role)}
        />
      ) : (
        <p>Loading workspace…</p>
      )}
    </AppShell>
  );
}
