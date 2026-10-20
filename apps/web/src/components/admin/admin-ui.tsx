"use client";

import { errorMessage } from "@/lib/error-message";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useTRPC, useTRPCClient } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

/** Building blocks for the admin dashboard: badges, panels, tables, pager, action dialog, funnel. */
export const fullDate = (d: Date) =>
  d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
/** Relative for the past ("3h ago"), short absolute for the future ("Oct 18"); the exact time is on hover. */
export function date(d: Date | string | null | undefined) {
  if (!d) return <span className="text-faint">—</span>;
  const at = new Date(d);
  const mins = Math.round((Date.now() - at.getTime()) / 60000);
  const text =
    mins < 0
      ? at.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : mins < 1
        ? "Just now"
        : mins < 60
          ? `${mins}m ago`
          : mins < 60 * 24
            ? `${Math.round(mins / 60)}h ago`
            : mins < 60 * 24 * 30
              ? `${Math.round(mins / 1440)}d ago`
              : at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <time dateTime={at.toISOString()} title={fullDate(at)} className="whitespace-nowrap tabular-nums">
      {text}
    </time>
  );
}
export type Tone = "good" | "warn" | "bad" | "neutral" | "info";
export const TONE: Record<Tone, string> = {
  good: "bg-success/10 text-success [--dot:var(--success)]",
  warn: "bg-warning/10 text-warning [--dot:var(--warning)]",
  bad: "bg-danger/10 text-danger [--dot:var(--danger)]",
  info: "bg-primary/10 text-primary-text [--dot:var(--primary)]",
  neutral: "bg-muted text-muted-foreground [--dot:var(--subtle)]",
};
/** Picks a tone from common status words so every status chip is coloured the same way. */
export const toneOf = (label: string): Tone => {
  const l = label.toLowerCase();
  if (/(suspend|fail|reject|error|cancel|past.?due)/.test(l)) return "bad";
  if (/(unverified|pending|queued|running|trial|incomplete)/.test(l)) return "warn";
  if (/(active|ok|delivered|done|paid|verified)/.test(l)) return "good";
  if (/team|complimentary/.test(l)) return "info";
  return "neutral";
};
export function Badge({ children, tone }: { children: ReactNode; tone?: Tone }) {
  const t = tone ?? (typeof children === "string" ? toneOf(children) : "neutral");
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap capitalize ${TONE[t]}`}>
      <span className="size-1.5 rounded-full bg-[var(--dot)]" aria-hidden />
      {children}
    </span>
  );
}
export function Panel({
  title,
  description,
  actions,
  flush,
  children,
}: {
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  /** Let a table run edge to edge inside the card. */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-md surface-raised">
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <div className={flush ? "" : "px-5 pb-5"}>{children}</div>
    </section>
  );
}
export function State({
  pending,
  error,
  empty,
}: {
  pending: boolean;
  error?: { message: string } | null;
  empty?: boolean;
}) {
  if (pending)
    return (
      <div className="grid gap-2 px-5 pb-5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  if (error)
    return (
      <p role="alert" className="mx-5 mb-5 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
        {errorMessage(error)}
      </p>
    );
  if (empty)
    return <p className="px-5 pt-6 pb-10 text-center text-sm text-muted-foreground">No records match this view.</p>;
  return null;
}
/** Number tiles. With `previous`, shows the change against the previous period as a coloured chip. */
export function Stats({
  items,
}: {
  items: { label: string; value: ReactNode; note?: string; previous?: number; alert?: boolean }[];
}) {
  return (
    <div className="stagger grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map((s) => {
        const change = typeof s.value === "number" && s.previous !== undefined ? s.value - s.previous : null;
        return (
          <div key={s.label} className={`rounded-md p-4 surface-raised ${s.alert ? "ring-1 ring-danger/25" : ""}`}>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {s.alert && <span className="size-1.5 animate-pulse rounded-full bg-danger" aria-label="Needs attention" />}
              {s.label}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <p className={`text-2xl font-semibold  tabular-nums ${s.alert ? "text-danger" : ""}`}>
                {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
              </p>
              {change !== null && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${change > 0 ? "bg-success/10 text-success" : change < 0 ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground"}`}
                >
                  {change > 0 ? "+" : ""}
                  {change.toLocaleString()}
                </span>
              )}
            </div>
            {(s.note || change !== null) && (
              <p className="mt-1 text-xs text-subtle">
                {s.note ?? `vs ${s.previous!.toLocaleString()} in the previous period`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto border-t">
      <Table className="[&_td]:px-5 [&_td]:py-2.5 [&_td]:text-sm [&_th]:px-5 [&_tr]:transition-colors [&_tbody_tr:hover]:bg-muted/50">
        <TableHeader className="sticky top-0 z-[1] bg-muted/40 backdrop-blur">
          <TableRow className="hover:bg-transparent">
            {headers.map((h) => (
              <TableHead key={h} className="h-9 text-xs font-medium text-muted-foreground">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}
export function Pager({
  total,
  offset,
  setOffset,
}: {
  total: number;
  offset: number;
  setOffset: (n: number) => void;
}) {
  if (total <= 25)
    return <p className="border-t px-5 py-3 text-xs text-subtle">{total ? `${total} ${total === 1 ? "record" : "records"}` : "0 records"}</p>;
  return (
    <div className="flex items-center justify-between gap-3 border-t px-5 py-3 text-xs text-subtle">
      <span className="tabular-nums">
        {offset + 1}–{Math.min(offset + 25, total)} of {total}
      </span>
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={offset + 25 >= total} onClick={() => setOffset(offset + 25)}>
          Next
        </Button>
      </div>
    </div>
  );
}
export type Action = {
  kind:
    "suspend" | "reactivate" | "sessions" | "grant" | "revokeGrant" | "retry";
  target: string;
  label: string;
  sessionId?: string;
};
export function ActionDialog({
  action,
  close,
}: {
  action: Action | null;
  close: () => void;
}) {
  const client = useTRPCClient(),
    trpc = useTRPC(),
    cache = useQueryClient();
  const [reason, setReason] = useState(""),
    [expiry, setExpiry] = useState("");
  useEffect(() => {
    setReason("");
    setExpiry("");
  }, [action]);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!action) return;
      const common = { reason };
      switch (action.kind) {
        case "suspend":
        case "reactivate":
          return client.admin.setAccountStatus.mutate({
            ...common,
            userId: action.target,
            suspended: action.kind === "suspend",
          });
        case "sessions":
          return client.admin.revokeSessions.mutate({
            ...common,
            userId: action.target,
            sessionId: action.sessionId,
          });
        case "grant":
          return client.admin.grantPremium.mutate({
            ...common,
            workspaceId: action.target,
            expiresAt: expiry ? new Date(expiry) : null,
          });
        case "revokeGrant":
          return client.admin.revokePremium.mutate({
            ...common,
            workspaceId: action.target,
          });
        case "retry":
          return client.admin.retryJob.mutate({
            ...common,
            jobId: Number(action.target),
          });
      }
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: trpc.admin.pathKey() });
      close();
    },
  });
  const descriptions: Record<Action["kind"], string> = {
    suspend:
      "This account will lose all active sessions and cannot sign in until reactivated.",
    reactivate:
      "The user can sign in again. Previously revoked sessions remain invalid.",
    sessions:
      "The selected sessions will stop working immediately. The user can sign in again.",
    grant:
      "Grants complimentary Team features to this workspace. No payment is created or changed. Leave expiry empty for indefinite access.",
    revokeGrant:
      "Removes complimentary access. An existing paid subscription remains unchanged.",
    retry:
      "Requeues this failed sync job. Another retry cannot be submitted while it is queued.",
  };
  return (
    <Dialog
      open={Boolean(action)}
      onOpenChange={(v) => {
        if (!v && !mutation.isPending) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action?.label}</DialogTitle>
          <DialogDescription>
            {action && descriptions[action.kind]}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <p className="break-all text-caption-1-medium text-text-tertiary">
            Target: {action?.target}
          </p>
          {action?.kind === "grant" && (
            <label className="grid gap-2 text-body-2-medium">
              Expires at (your local time)
              <Input
                type="datetime-local"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </label>
          )}
          <label className="grid gap-2 text-body-2-medium">
            Reason
            <Textarea
              required
              minLength={5}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you making this change?"
            />
          </label>
          {mutation.error && (
            <p
              role="alert"
              className="text-body-2-regular text-text-error-primary"
            >
              {errorMessage(mutation.error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={close}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={reason.trim().length < 5}
              pending={mutation.isPending}
            >
              Confirm change
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export const STEPS = ["Registered", "Created a workspace", "Connected GitHub", "Submitted a review"];
/** Activation funnel as steps: how many reached each one and what share carried on from the step before. */
export function Funnel({ values }: { values: number[] }) {
  const top = Math.max(1, values[0] ?? 0);
  return (
    <ol aria-label="Activation journey" className="stagger grid gap-3">
      {STEPS.map((label, i) => {
        const n = values[i] ?? 0;
        const prev = i ? (values[i - 1] ?? 0) : n;
        const kept = prev ? Math.round((n / prev) * 100) : 0;
        return (
          <li key={label} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <span className="grid size-5 place-items-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground tabular-nums">{i + 1}</span>
                {label}
              </span>
              <span className="flex items-baseline gap-2 tabular-nums">
                <span className="font-medium">{n.toLocaleString()}</span>
                {i > 0 && (
                  <span className={`text-xs ${kept >= 50 ? "text-success" : kept >= 20 ? "text-warning" : "text-danger"}`}>{kept}% of previous</span>
                )}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-sm bg-muted">
              <div className="h-full rounded-sm bg-primary transition-[width] duration-700 ease-power3-out" style={{ width: `${(n / top) * 100}%`, opacity: 1 - i * 0.18 }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
export const FEATURE_LABEL: Record<string, string> = {
  board_viewed: "Viewed the review board",
  pr_opened: "Opened a pull request",
  guide_viewed: "Read a review guide",
  review_submitted: "Submitted a review",
  signed_up: "Signed up",
  workspace_created: "Created a workspace",
  github_installed: "Installed the GitHub app",
};
export const featureLabel = (name: string) => FEATURE_LABEL[name] ?? name.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
/** Feature adoption as ranked bars: share of active users, with raw event counts alongside. */
export function Adoption({ rows, people }: { rows: { name: string; n: number; users: number }[]; people: number }) {
  const sorted = [...rows].sort((a, b) => b.users - a.users);
  const top = Math.max(1, people, ...sorted.map((r) => r.users));
  return (
    <ul className="stagger grid gap-2.5">
      {sorted.map((f) => (
        <li key={f.name} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate">{featureLabel(f.name)}</span>
          <span className="h-1.5 overflow-hidden rounded-sm bg-muted">
            <span className="block h-full rounded-sm bg-primary/70" style={{ width: `${(f.users / top) * 100}%` }} />
          </span>
          <span className="w-28 text-right text-xs text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">{f.users}</span> users · {f.n.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
