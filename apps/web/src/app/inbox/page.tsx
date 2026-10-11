"use client";
import { PersonalReviewInbox } from "@/components/review/personal-inbox";
import { Button as ShadcnButton } from "@/components/ui/button";
import {
  RiAlarmLine,
  RiAlarmWarningLine,
  RiChat3Line,
  RiErrorWarningLine,
  RiGitCommitLine,
  RiInboxLine,
  RiTimerLine,
  RiUserReceived2Line,
  RiEyeLine,
} from "@remixicon/react";
import { FilterSelect } from "@/components/toolbar";
import {
  EmptyPreview,
  GhostRow,
  HUE,
  HueIcon,
  type Hue,
} from "@/components/ui/empty-preview";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { QueryError } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";
import { useTRPC } from "@/trpc/react";

const KINDS = {
  review_requested: "Review requested",
  new_commit: "New commits after your review",
  thread_reply: "Reply to your conversation",
  review_submitted: "Review on your PR",
  check_failed: "Check failed on your PR",
  review_reminder: "Review deadline approaching",
  review_overdue: "Review overdue",
} as const;

const KIND_META: Record<
  keyof typeof KINDS,
  { icon: typeof RiInboxLine; hue: Hue }
> = {
  review_requested: { icon: RiUserReceived2Line, hue: "indigo" },
  new_commit: { icon: RiGitCommitLine, hue: "blue" },
  thread_reply: { icon: RiChat3Line, hue: "teal" },
  review_submitted: { icon: RiEyeLine, hue: "green" },
  check_failed: { icon: RiErrorWarningLine, hue: "red" },
  review_reminder: { icon: RiTimerLine, hue: "amber" },
  review_overdue: { icon: RiAlarmWarningLine, hue: "orange" },
};

function Inbox({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const router = useRouter();
  const [view, setView] = useState<"unread" | "all" | "snoozed">("unread");
  const [repoId, setRepoId] = useState<number>();
  const [kind, setKind] = useState<keyof typeof KINDS>();
  const [cursor, setCursor] = useState<{ at: Date; id: string }>();
  const q = useQuery({
    ...trpc.inbox.list.queryOptions({
      workspaceId,
      view,
      repoId,
      kind,
      cursor,
    }),
    refetchInterval: 30_000,
  });
  const refresh = () =>
    Promise.all([
      client.invalidateQueries(trpc.inbox.list.queryFilter()),
      client.invalidateQueries(trpc.inbox.unreadCount.queryFilter()),
    ]);
  const read = useMutation(
    trpc.inbox.markRead.mutationOptions({ onSuccess: refresh }),
  );
  const dismiss = useMutation(
    trpc.inbox.dismiss.mutationOptions({ onSuccess: refresh }),
  );
  const remind = useMutation(
    trpc.inbox.remind.mutationOptions({ onSuccess: refresh }),
  );
  const busy = read.isPending || dismiss.isPending || remind.isPending;
  const error = read.error ?? dismiss.error ?? remind.error;
  function tomorrow() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  const unread = (item: { readAt: Date | null; remindAt: Date | null }) =>
    !item.readAt || Boolean(item.remindAt && item.remindAt <= new Date());
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={view}
          onValueChange={(v) => {
            setView(v as typeof view);
            setCursor(undefined);
          }}
        >
          <TabsList className="h-[30px]">
            <TabsTrigger value="unread">Unread</TabsTrigger>
            <TabsTrigger value="all">All active</TabsTrigger>
            <TabsTrigger value="snoozed">Reminders</TabsTrigger>
          </TabsList>
        </Tabs>
        <FilterSelect
          label="Repository"
          value={repoId ? String(repoId) : ""}
          onChange={(v) => {
            setRepoId(v ? Number(v) : undefined);
            setCursor(undefined);
          }}
          options={[
            { value: "", label: "All" },
            ...(q.data?.repos.map((r) => ({
              value: String(r.id),
              label: r.fullName,
            })) ?? []),
          ]}
        />
        <FilterSelect
          label="Event"
          value={kind ?? ""}
          onChange={(v) => {
            setKind(v ? (v as keyof typeof KINDS) : undefined);
            setCursor(undefined);
          }}
          options={[
            { value: "", label: "All" },
            ...Object.entries(KINDS).map(([k, label]) => ({ value: k, label })),
          ]}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      )}
      {q.error ? (
        <QueryError error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[74px] w-full rounded-xl" />
          ))}
        </div>
      ) : !q.data.items.length ? (
        <div className="border border-separator-border bg-background-primary-default shadow-none rounded-xl">
          <EmptyPreview
            icon={view === "snoozed" ? RiAlarmLine : RiInboxLine}
            hue="blue"
            title={
              view === "unread"
                ? "You are all caught up"
                : view === "snoozed"
                  ? "No reminders set"
                  : "Nothing active"
            }
            description={
              view === "snoozed"
                ? "Choose “Remind me tomorrow” on any item and it comes back here at 9:00."
                : "Review requests, replies, new commits, failed checks and deadline alerts land here, newest first."
            }
            preview={
              <>
                <GhostRow hue="purple" accent="ring" wide={64} />
                <GhostRow hue="red" accent="ring" wide={48} />
                <GhostRow hue="blue" accent="ring" wide={72} />
              </>
            }
          />
        </div>
      ) : (
        <ul className="border border-separator-border bg-background-primary-default shadow-none divide-y overflow-hidden rounded-xl">
          {q.data.items.map((item) => {
            const meta = KIND_META[item.kind];
            const isUnread = unread(item);
            return (
              <li
                key={item.id}
                className="group relative flex gap-3 px-4 py-3.5 transition-colors hover:bg-foreground/[0.02]"
              >
                <HueIcon icon={meta.icon} hue={meta.hue} className="mt-0.5" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className={cn("font-medium", HUE[meta.hue].text)}>
                      {KINDS[item.kind]}
                    </span>
                    <span className="text-subtle">
                      {item.repo}#{item.number}
                      {item.context.actor && ` · ${item.context.actor}`}
                    </span>
                    <span className="text-subtle ml-auto tabular-nums">
                      {item.occurredAt.toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <ShadcnButton
                    variant="row"
                    size="none"
                    type="button"
                    disabled={busy}
                    className={cn(
                      "block truncate text-left text-sm hover:bg-transparent hover:underline",
                      isUnread ? "font-medium" : "text-muted-foreground",
                    )}
                    onClick={async () => {
                      try {
                        await read.mutateAsync({ id: item.id });
                        router.push(`/review/${item.repo}/${item.number}`);
                      } catch {
                        /* The mutation error appears above the inbox. */
                      }
                    }}
                  >
                    {item.title}
                  </ShadcnButton>
                  {item.remindAt && view === "snoozed" && (
                    <p className="text-subtle text-xs">
                      Reminder {item.remindAt.toLocaleString()}
                    </p>
                  )}
                  <div className="-ml-2 flex flex-wrap items-center gap-0.5 pt-0.5 opacity-80 transition-opacity group-hover:opacity-100">
                    {item.context.url && (
                      <Button asChild size="xs" variant="ghost">
                        <a
                          href={item.context.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => read.mutate({ id: item.id })}
                        >
                          Open on GitHub
                        </a>
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => read.mutate({ id: item.id })}
                    >
                      Mark read
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        remind.mutate({ id: item.id, at: tomorrow() })
                      }
                    >
                      Remind me tomorrow
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => dismiss.mutate({ id: item.id })}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
                {isUnread && (
                  <span
                    aria-label="Unread"
                    className="bg-hue-indigo mt-2 size-2 shrink-0 rounded-full"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex gap-2">
        {cursor && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(undefined)}
          >
            First page
          </Button>
        )}
        {q.data?.nextCursor && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(q.data!.nextCursor!)}
          >
            Next page
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  const { workspace } = useWorkspace();
  return (
    <AppShell
      title="Inbox"
      description="Review requests, replies, and changes that need your attention."
    >
      {workspace ? (
        <div className="flex flex-col gap-8">
          <PersonalReviewInbox key={workspace.id} workspaceId={workspace.id} />
          <details>
            <summary className="text-body-medium">
              Activity notifications
            </summary>
            <Inbox key={workspace.id} workspaceId={workspace.id} />
          </details>
        </div>
      ) : (
        <p>Select a workspace.</p>
      )}
    </AppShell>
  );
}
