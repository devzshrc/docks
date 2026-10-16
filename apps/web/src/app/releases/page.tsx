"use client";
import { Button as ShadcnButton } from "@/components/ui/button";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui-compat/controls";
import { Input } from "@/components/ui-compat/controls";
import { Select, SelectItem } from "@/components/ui-compat/controls";
import { Chip } from "@/components/ui-compat/controls";
import {
  RiAddLine,
  RiGitPullRequestLine,
  RiRefreshLine,
  RiRocketLine,
} from "@remixicon/react";
import { Button as CoreButton } from "@/components/ui/button";
import {
  EmptyPreview,
  GhostRow,
  UpgradeCallout,
} from "@/components/ui/empty-preview";
import { cx } from "@/utils/cx";
import { QueryError } from "@/components/query-state";
import { EvidenceExport } from "@/components/review/evidence-export";
import { useWorkspace } from "@/hooks/use-workspace";
import { useTRPC } from "@/trpc/react";
const panel =
  "overflow-hidden rounded-md border border-separator-border bg-background-primary-default";
const caption = "text-[13px] text-muted-foreground";

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
  if (report.isPending)
    return (
      <p role="status" className="p-6 text-body-regular text-text-secondary">
        Loading release…
      </p>
    );
  if (report.error) return <QueryError error={report.error} />;
  const { release, items, incomplete } = report.data;
  const error =
    setPr.error ?? refresh.error ?? update.error ?? candidates.error;
  const ready =
    !incomplete &&
    items.length > 0 &&
    items.every(
      (r) =>
        r.pr.state === "merged" ||
        (r.pr.state === "open" && r.readiness.state === "ready"),
    );
  return (
    <section
      aria-label="Release details"
      className={cx(panel, "min-w-0 space-y-5 p-5 sm:p-6")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="break-words text-title-3-semibold text-text-primary">
            {release.name}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip
              color={release.status === "completed" ? "neutral" : "purple"}
              variant="caption"
            >
              {release.status === "completed" ? "Completed" : "Active"}
            </Chip>
            <Chip color={ready ? "lime" : "yellow"} variant="caption">
              {ready ? "Ready to merge" : "Review required"}
            </Chip>
            {release.targetDate && (
              <span className={caption}>
                Target{" "}
                {release.targetDate.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
        </div>
        <Button
          size="small"
          variant="secondary"
          leadingIcon={RiRefreshLine}
          disabled={!paid || refresh.isPending}
          onClick={() => refresh.mutate({ id })}
        >
          {refresh.isPending ? "Refreshing…" : "Refresh requirements"}
        </Button>
      </div>
      <p className="text-body-2-regular text-text-secondary">
        Results expire after 15 minutes or a changed commit. Merged PRs remain
        visible. Ready means merge requirements passed when checked.
      </p>
      {incomplete && (
        <p
          role="alert"
          className="rounded-md bg-background-secondary-default p-3 text-body-2-regular text-text-error-primary"
        >
          This report is incomplete because some repositories are outside your
          access.
        </p>
      )}
      {error && <QueryError error={error} />}
      {items.length === 0 && (
        <div className="rounded-md bg-muted/30">
          <EmptyPreview
            icon={RiGitPullRequestLine}
            hue="pink"
            title="No pull requests yet"
            description={
              manage && paid
                ? "Choose a pull request below to start tracking this release."
                : "Pull requests added to this release will appear here."
            }
          />
        </div>
      )}
      <div className="space-y-3">
        {items.length > 0 && (
          <h3 className="text-body-medium text-text-primary">
            Pull requests{" "}
            <span className="text-text-tertiary">({items.length})</span>
          </h3>
        )}
        {items.map((item) => (
          <article
            key={`${item.pr.repoId}:${item.pr.number}`}
            className="bg-card shadow-card space-y-3 rounded-md p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Link
                className="min-w-0 break-words text-body-medium text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                href={`/review/${item.repo}/${item.pr.number}`}
              >
                <span className="mb-1 block text-caption-1-medium text-text-tertiary">
                  {item.repo} · #{item.pr.number}
                </span>
                {item.pr.title}
              </Link>
              {manage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
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
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip
                variant="caption"
                color={
                  item.pr.state === "merged"
                    ? "purple"
                    : item.pr.state === "closed"
                      ? "neutral"
                      : item.readiness.state === "ready"
                        ? "lime"
                        : item.readiness.state === "unknown"
                          ? "neutral"
                          : "rose"
                }
              >
                {item.pr.state === "merged"
                  ? "Merged"
                  : item.pr.state === "closed"
                    ? "Closed without merge"
                    : item.readiness.state === "unknown"
                      ? "Unknown"
                      : item.readiness.state === "ready"
                        ? "Ready"
                        : "Blocked"}
              </Chip>
              <span className={caption}>
                By {item.pr.authorLogin} · Reviewers:{" "}
                {item.pr.requestedReviewers.join(", ") || "None requested"}
              </span>
            </div>
            <p className="break-words text-caption-1-medium text-text-tertiary">
              Commit {item.pr.headSha.slice(0, 12)} · Checked{" "}
              {item.readiness.checkedAt
                ? new Date(item.readiness.checkedAt).toLocaleString()
                : "Never"}
            </p>
            {item.pr.state === "open" &&
              (item.readiness.blockers.length > 0 ||
                item.readiness.warnings.length > 0) && (
                <ul className="space-y-2 text-body-2-regular text-text-secondary">
                  {item.readiness.blockers.map((blocker, i) => (
                    <li key={i}>
                      {blocker.url ? (
                        <a
                          className="text-text-primary underline underline-offset-4"
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
                    <li className="text-text-tertiary" key={`w${i}`}>
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
            {item.cycles.map((cycle) => (
              <p
                key={cycle.id}
                className="text-caption-1-medium text-text-secondary"
              >
                {cycle.kind === "first" ? "First review" : cycle.reviewer} ·{" "}
                {cycle.pausedAt ? "Paused" : "Due"}{" "}
                {cycle.dueAt.toLocaleString()}
              </p>
            ))}
          </article>
        ))}
      </div>
      {manage && paid && (
        <div className="flex flex-wrap items-center gap-2 border-t border-separator-border pt-5">
          <Select
            aria-label="Add pull request to release"
            placeholder="Choose a pull request"
            className="min-w-0 flex-1 basis-64"
            selectedKey={pick || null}
            onSelectionChange={(v) => setPick(String(v ?? ""))}
            isDisabled={setPr.isPending || candidates.isPending}
          >
            {candidates.data
              ?.filter(
                (c) =>
                  !items.some(
                    (i) => i.pr.repoId === c.repoId && i.pr.number === c.number,
                  ),
              )
              .map((c) => (
                <SelectItem
                  key={`${c.repoId}:${c.number}`}
                  id={`${c.repo}:${c.number}`}
                  textValue={`${c.repo} #${c.number}: ${c.title}`}
                >
                  {c.repo} #{c.number}: {c.title}
                </SelectItem>
              ))}
          </Select>
          <Button
            size="small"
            disabled={!pick || setPr.isPending}
            onClick={() => {
              const split = pick.lastIndexOf(":");
              setPr.mutate(
                {
                  id,
                  repo: pick.slice(0, split),
                  number: Number(pick.slice(split + 1)),
                  included: true,
                },
                { onSuccess: () => setPick("") },
              );
            }}
          >
            Add PR
          </Button>
          <Button
            size="small"
            variant="secondary"
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
      {manage && paid && (
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
  const selectedId =
    selected && list.data?.some((release) => release.id === selected)
      ? selected
      : (list.data?.find((release) => release.status === "active")?.id ??
        list.data?.[0]?.id);
  return (
    <div className="space-y-6">
      {policy.data?.plan === "free" && (
        <UpgradeCallout
          icon={RiRocketLine}
          action={
            <CoreButton asChild size="sm">
              <Link href="/settings/billing">Upgrade</Link>
            </CoreButton>
          }
        >
          Manage releases, refresh requirements and export evidence with the
          Team plan. You can still view existing reports.
        </UpgradeCallout>
      )}
      {(list.error || policy.error || create.error) && (
        <QueryError error={(list.error ?? policy.error ?? create.error)!} />
      )}
      {manage && paid && (
        <details
          className={panel}
          open={!list.isPending && list.data?.length === 0 ? true : undefined}
        >
          <summary className="cursor-pointer rounded-md p-5 text-body-medium text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring">
            Create a release
          </summary>
          <form
            className="space-y-4 border-t border-separator-border p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              create.mutate({
                workspaceId,
                name: name.trim(),
                targetDate: date ? new Date(`${date}T12:00:00Z`) : null,
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Release name"
                placeholder="e.g. October product update"
                maxLength={100}
                isRequired
                value={name}
                onChange={setName}
                isDisabled={create.isPending}
              />
              <Input
                label="Target date (optional)"
                type="date"
                value={date}
                onChange={setDate}
                isDisabled={create.isPending}
              />
            </div>
            <Button
              type="submit"
              size="small"
              leadingIcon={RiAddLine}
              disabled={create.isPending || !name.trim()}
            >
              {create.isPending ? "Creating…" : "Create release"}
            </Button>
          </form>
        </details>
      )}
      {list.isPending && (
        <p role="status" className="p-6 text-body-regular text-text-secondary">
          Loading releases…
        </p>
      )}
      {list.data?.length === 0 && (
        <div className={panel}>
          <EmptyPreview
            icon={RiRocketLine}
            hue="pink"
            title="Your next release starts here"
            description={
              manage && paid
                ? "Create a release, add its pull requests, and watch readiness fill up as each one is approved and passes its checks."
                : "Releases group pull requests that ship together. Each shows what is ready and what still blocks it."
            }
            preview={
              <>
                <GhostRow hue="pink" accent="ring" wide={56} />
                <GhostRow hue="green" accent="ring" wide={70} />
                <GhostRow hue="amber" accent="ring" wide={44} />
              </>
            }
          />
        </div>
      )}
      {Boolean(list.data?.length) && (
        <div className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav
            aria-label="Select a release"
            className={cx(panel, "space-y-1 p-3")}
          >
            <h2 className="px-3 py-2 text-caption-1-semibold text-text-tertiary">
              RELEASES
            </h2>
            {list.data?.map((release) => (
              <ShadcnButton
                variant="row"
                size="none"
                key={release.id}
                type="button"
                aria-pressed={selectedId === release.id}
                onClick={() => setSelected(release.id)}
                className={cx(
                  "flex w-full flex-col items-start gap-2 rounded-md p-3 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                  selectedId === release.id
                    ? "bg-primary/10 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_40%,transparent)] hover:bg-primary/10"
                    : "",
                )}
              >
                <span className="block break-words text-body-medium text-text-primary">
                  {release.name}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Chip
                    variant="caption"
                    color={release.status === "active" ? "purple" : "neutral"}
                  >
                    {release.status === "active" ? "Active" : "Completed"}
                  </Chip>
                  {release.targetDate && (
                    <span className="text-caption-1-medium text-text-tertiary">
                      {release.targetDate.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                </span>
              </ShadcnButton>
            ))}
          </nav>
          {selectedId && (
            <Detail
              key={selectedId}
              id={selectedId}
              workspaceId={workspaceId}
              manage={manage}
              paid={paid}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const { workspace } = useWorkspace();
  return (
    <AppShell
      title="Releases"
      description="Group pull requests, resolve blockers, and ship with confidence."
    >
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
