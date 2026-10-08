"use client";

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
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {(["unread", "all", "snoozed"] as const).map((v) => (
          <Button
            key={v}
            variant={view === v ? "default" : "outline"}
            size="sm"
            aria-pressed={view === v}
            onClick={() => {
              setView(v);
              setCursor(undefined);
            }}
          >
            {v === "all"
              ? "All active"
              : v === "unread"
                ? "Unread"
                : "Reminders"}
          </Button>
        ))}
        <select
          aria-label="Repository"
          className="bg-background rounded border px-2 text-sm"
          value={repoId ?? ""}
          onChange={(e) => {
            setRepoId(e.target.value ? Number(e.target.value) : undefined);
            setCursor(undefined);
          }}
        >
          <option value="">All repositories</option>
          {q.data?.repos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.fullName}
            </option>
          ))}
        </select>
        <select
          aria-label="Event"
          className="bg-background rounded border px-2 text-sm"
          value={kind ?? ""}
          onChange={(e) => {
            setKind(
              e.target.value
                ? (e.target.value as keyof typeof KINDS)
                : undefined,
            );
            setCursor(undefined);
          }}
        >
          <option value="">All events</option>
          {Object.entries(KINDS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      )}
      {q.error ? (
        <QueryError error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <p>Loading inbox…</p>
      ) : !q.data.items.length ? (
        <p className="text-muted-foreground">
          No items in this view. New review activity will appear here.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {q.data.items.map((item) => (
            <li key={item.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{KINDS[item.kind]}</strong>
                {(!item.readAt ||
                  (item.remindAt && item.remindAt <= new Date())) && (
                  <span className="text-info text-xs">Unread</span>
                )}
                <span className="text-muted-foreground text-xs">
                  {item.occurredAt.toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                disabled={busy}
                className="text-left font-medium underline underline-offset-4"
                onClick={async () => {
                  try {
                    await read.mutateAsync({ id: item.id });
                    router.push(`/review/${item.repo}/${item.number}`);
                  } catch { /* The mutation error appears above the inbox. */ }
                }}
              >
                {item.title}
              </button>
              <p className="text-muted-foreground text-xs">
                {item.repo}#{item.number}
                {item.context.actor && ` · ${item.context.actor}`}
                {item.remindAt &&
                  view === "snoozed" &&
                  ` · Reminder ${item.remindAt.toLocaleString()}`}
              </p>
              <div className="flex flex-wrap gap-2">
                {item.context.url && (
                  <a
                    className="text-xs underline"
                    href={item.context.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => read.mutate({ id: item.id })}
                  >
                    Open event on GitHub
                  </a>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => read.mutate({ id: item.id })}
                >
                  Mark read
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => remind.mutate({ id: item.id, at: tomorrow() })}
                >
                  Remind me tomorrow
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => dismiss.mutate({ id: item.id })}
                >
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        {cursor && (
          <Button variant="outline" onClick={() => setCursor(undefined)}>
            First page
          </Button>
        )}
        {q.data?.nextCursor && (
          <Button
            variant="outline"
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
        <Inbox key={workspace.id} workspaceId={workspace.id} />
      ) : (
        <p>Select a workspace.</p>
      )}
    </AppShell>
  );
}
