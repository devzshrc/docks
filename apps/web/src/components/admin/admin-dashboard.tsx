"use client";
import { errorMessage } from "@/lib/error-message";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RiArrowRightLine,
  RiSearchLine,
  RiRefreshLine,
  RiComputerLine,
} from "@remixicon/react";
import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useTRPC, useTRPCClient } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendChart, weekLabel } from "@/components/charts/trend-chart";
import { PersonAvatar } from "@/components/person-avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
const fullDate = (d: Date) =>
  d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
/** Relative for the past ("3h ago"), short absolute for the future ("Oct 18"); the exact time is on hover. */
function date(d: Date | string | null | undefined) {
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
type Tone = "good" | "warn" | "bad" | "neutral" | "info";
const TONE: Record<Tone, string> = {
  good: "bg-success/10 text-success [--dot:var(--success)]",
  warn: "bg-warning/10 text-warning [--dot:var(--warning)]",
  bad: "bg-danger/10 text-danger [--dot:var(--danger)]",
  info: "bg-primary/10 text-primary-text [--dot:var(--primary)]",
  neutral: "bg-muted text-muted-foreground [--dot:var(--subtle)]",
};
/** Picks a tone from common status words so every status chip is coloured the same way. */
const toneOf = (label: string): Tone => {
  const l = label.toLowerCase();
  if (/(suspend|fail|reject|error|cancel|past.?due)/.test(l)) return "bad";
  if (/(unverified|pending|queued|running|trial|incomplete)/.test(l)) return "warn";
  if (/(active|ok|delivered|done|paid|verified)/.test(l)) return "good";
  if (/team|complimentary/.test(l)) return "info";
  return "neutral";
};
function Badge({ children, tone }: { children: ReactNode; tone?: Tone }) {
  const t = tone ?? (typeof children === "string" ? toneOf(children) : "neutral");
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap capitalize ${TONE[t]}`}>
      <span className="size-1.5 rounded-full bg-[var(--dot)]" aria-hidden />
      {children}
    </span>
  );
}
function Panel({
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
function State({
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
function Stats({
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
function DataTable({
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
function Pager({
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
type Action = {
  kind:
    "suspend" | "reactivate" | "sessions" | "grant" | "revokeGrant" | "retry";
  target: string;
  label: string;
  sessionId?: string;
};
function ActionDialog({
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
const STEPS = ["Registered", "Created a workspace", "Connected GitHub", "Submitted a review"];
/** Activation funnel as steps: how many reached each one and what share carried on from the step before. */
function Funnel({ values }: { values: number[] }) {
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
const FEATURE_LABEL: Record<string, string> = {
  board_viewed: "Viewed the review board",
  pr_opened: "Opened a pull request",
  guide_viewed: "Read a review guide",
  review_submitted: "Submitted a review",
  signed_up: "Signed up",
  workspace_created: "Created a workspace",
  github_installed: "Installed the GitHub app",
};
const featureLabel = (name: string) => FEATURE_LABEL[name] ?? name.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
/** Feature adoption as ranked bars: share of active users, with raw event counts alongside. */
function Adoption({ rows, people }: { rows: { name: string; n: number; users: number }[]; people: number }) {
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

export function AdminDashboard({
  section = "overview",
  id,
}: {
  section?:
    "overview" | "users" | "workspaces" | "usage" | "activity" | "health";
  id?: string;
}) {
  const trpc = useTRPC(),
    cache = useQueryClient();
  const access = useQuery(trpc.admin.access.queryOptions());
  const [action, setAction] = useState<Action | null>(null),
    [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [offset, setOffset] = useState(0),
    [errorsOffset, setErrorsOffset] = useState(0),
    [webhooksOffset, setWebhooksOffset] = useState(0),
    [webhookResult, setWebhookResult] = useState<
      "all" | "ok" | "failed" | "signature_rejected"
    >("all"),
    [openError, setOpenError] = useState<string | null>(null),
    [days, setDays] = useState(30),
    [status, setStatus] = useState<"all" | "active" | "suspended">("all");
  // ⌘K "search users for …" lands here with ?q=.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setSearch(q);
    const onSearch = (e: Event) => setSearch((e as CustomEvent<string>).detail);
    window.addEventListener("admin-search", onSearch);
    return () => window.removeEventListener("admin-search", onSearch);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setOffset(0);
      setErrorsOffset(0);
      setWebhooksOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const page = { search: debounced, offset, limit: 25 };
  const overview = useQuery(
    trpc.admin.overview.queryOptions(
      { days },
      { enabled: section === "overview" || section === "usage" },
    ),
  );
  const retention = useQuery(
    trpc.admin.retention.queryOptions(undefined, {
      enabled: section === "usage",
    }),
  );
  const users = useQuery(
    trpc.admin.users.queryOptions(
      { ...page, status },
      { enabled: section === "users" && !id },
    ),
  );
  const workspaces = useQuery(
    trpc.admin.workspaces.queryOptions(page, {
      enabled: section === "workspaces" && !id,
    }),
  );
  const user = useQuery(
    trpc.admin.user.queryOptions(
      { userId: id ?? "" },
      { enabled: section === "users" && !!id },
    ),
  );
  const workspace = useQuery(
    trpc.admin.workspace.queryOptions(
      { workspaceId: id ?? "" },
      { enabled: section === "workspaces" && !!id },
    ),
  );
  const audit = useQuery(
    trpc.admin.audit.queryOptions(page, { enabled: section === "activity" }),
  );
  const health = useQuery(
    trpc.admin.health.queryOptions(page, {
      enabled: section === "health",
      refetchInterval: 15000,
      refetchIntervalInBackground: false,
    }),
  );
  const errors = useQuery(
    trpc.admin.errors.queryOptions(
      { search: debounced, offset: errorsOffset, limit: 25 },
      {
        enabled: section === "health",
        refetchInterval: 30000,
        refetchIntervalInBackground: false,
      },
    ),
  );
  const webhooks = useQuery(
    trpc.admin.webhooks.queryOptions(
      {
        search: debounced,
        offset: webhooksOffset,
        limit: 25,
        result: webhookResult,
      },
      {
        enabled: section === "health",
        refetchInterval: 30000,
        refetchIntervalInBackground: false,
      },
    ),
  );
  const write = !!access.data && access.data.role !== "viewer",
    owner = access.data?.role === "owner";
  const titles = {
    overview: "Overview",
    users: "Users",
    workspaces: "Workspaces",
    usage: "Usage & retention",
    activity: "Audit trail",
    health: "System health",
  };
  const tableQuery =
    section === "users"
      ? users
      : section === "workspaces"
        ? workspaces
        : section === "activity"
          ? audit
          : health;
  const blurbs = {
    overview: "Sign-ups, activation and what people do in Docks.",
    users: "Everyone with a Docks account. Open a person to manage access or sessions.",
    workspaces: "Customer workspaces, their plans and members.",
    usage: "Which features stick, and who comes back in week two.",
    activity: "Every admin change, with who made it and why.",
    health: "Background jobs, errors and webhook deliveries. Refreshes on its own.",
  };
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">
            {id
              ? section === "users"
                ? (user.data?.name ?? "Person")
                : (workspace.data?.name ?? "Workspace")
              : titles[section]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {id ? <span className="font-mono text-xs">{id}</span> : blurbs[section]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(section === "overview" || section === "usage") && (
            <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <TabsList aria-label="Reporting range">
                {[7, 30, 90].map((n) => (
                  <TabsTrigger key={n} value={String(n)} className="px-3">
                    {n}d
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Refresh"
            title="Refresh"
            onClick={() => cache.invalidateQueries({ queryKey: trpc.admin.pathKey() })}
          >
            <RiRefreshLine />
          </Button>
        </div>
      </div>
      {(section === "overview" || section === "usage") && (
        <>
          <State pending={overview.isPending} error={overview.error} />
          {overview.data && (
            <>
              <Stats
                items={[
                  { label: "Registered users", value: overview.data.users },
                  {
                    label: "New registrations",
                    value: overview.data.signups,
                    previous: overview.data.previousSignups,
                  },
                  {
                    label: "Active users",
                    value: overview.data.active,
                    previous: overview.data.previousActive,
                  },
                  { label: "Workspaces", value: overview.data.workspaces },
                ]}
              />
              <div className="grid gap-5 xl:grid-cols-2">
                <Panel
                  title="Registration trend"
                  description="Accounts created each day"
                >
                  <TrendChart
                    rows={overview.data.days.map((d) => ({
                      label: weekLabel(d.day),
                      value: d.n,
                    }))}
                    label="Registrations"
                    ariaLabel="Daily registrations"
                    unit="day"
                    height={220}
                  />
                </Panel>
                <Panel
                  title="Activation journey"
                  description="People who signed up in this range, and how far they got"
                >
                  <Funnel values={overview.data.funnel} />
                </Panel>
              </div>
              <Stats
                items={[
                  {
                    label: "Successful logins",
                    value:
                      overview.data.logins.find((l) => l.kind === "login")?.n ??
                      0,
                    note: "Recorded since auth tracking was enabled",
                  },
                  {
                    label: "Failed email logins",
                    value:
                      overview.data.logins.find(
                        (l) => l.kind === "login_failed",
                      )?.n ?? 0,
                  },
                  {
                    label: "Reviews submitted",
                    value:
                      overview.data.features.find(
                        (f) => f.name === "review_submitted",
                      )?.n ?? 0,
                  },
                  {
                    label: "Pull requests opened",
                    value:
                      overview.data.features.find((f) => f.name === "pr_opened")
                        ?.n ?? 0,
                  },
                ]}
              />
              <Panel
                title="Feature adoption"
                description="Distinct people who used each feature, with total events. Page views don't count as active use."
              >
                <Adoption rows={overview.data.features} people={overview.data.active} />
              </Panel>
            </>
          )}
          {section === "usage" && (
            <Panel flush
              title="Week-two retention"
              description="First review cohorts with 14 days of observation; meaningful activity during days 7–14"
            >
              <State
                pending={retention.isPending}
                error={retention.error}
                empty={retention.data?.length === 0}
              />
              {retention.data && (
                <DataTable
                  headers={[
                    "First review week",
                    "Users",
                    "Returned",
                    "Retention",
                  ]}
                >
                  {retention.data.map((r) => (
                    <TableRow key={r.cohort}>
                      <TableCell>{r.cohort}</TableCell>
                      <TableCell>{r.users}</TableCell>
                      <TableCell>{r.returning}</TableCell>
                      <TableCell>
                        {r.users
                          ? Math.round((r.returning / r.users) * 100)
                          : 0}
                        %
                      </TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              )}
            </Panel>
          )}
        </>
      )}
      {section === "health" && health.data && (
        <>
          <p className="text-xs text-subtle">
            Updated{" "}
            {health.dataUpdatedAt
              ? new Date(health.dataUpdatedAt).toLocaleTimeString()
              : "—"}{" "}
            · refreshes every 15 seconds
            {health.isError ? " · Refresh failed; showing previous data" : ""}
          </p>
          <Stats
            items={[
              {
                label: "Ready jobs",
                value: health.data.queue.ready,
                note: "Excludes future scheduled jobs",
              },
              {
                label: "Oldest ready job",
                value: health.data.queue.oldestReadyAt
                  ? `${Math.max(0, Math.floor((Date.now() - new Date(health.data.queue.oldestReadyAt).getTime()) / 60000))} min`
                  : "None",
              },
              {
                label: "Running over 10 minutes",
                value: health.data.queue.staleRunning,
                alert: health.data.queue.staleRunning > 0,
                note: "Investigate before retrying",
              },
              {
                label: "Last job completion",
                value: health.data.queue.lastCompletedAt ? date(health.data.queue.lastCompletedAt) : "No data",
              },
            ]}
          />
          <Stats
            items={[
              {
                label: "AI failures (5 min)",
                alert: health.data.ai.failures > 0,
                value: health.data.ai.calls
                  ? `${health.data.ai.failures} / ${health.data.ai.calls}`
                  : "No data",
              },
              {
                label: "AI p95 (5 min)",
                value:
                  health.data.ai.p95Ms === null
                    ? "No data"
                    : `${Math.round(health.data.ai.p95Ms)} ms`,
              },
              {
                label: "Webhook failures (5 min)",
                alert: health.data.webhooks.failures > 0,
                value: health.data.webhooks.calls
                  ? `${health.data.webhooks.failures} / ${health.data.webhooks.calls}`
                  : "No data",
              },
              {
                label: "Latest deployment",
                value: health.data.deployments[0]?.sha.slice(0, 7) ?? "No data",
                note: health.data.deployments[0] ? `Deployed ${new Date(health.data.deployments[0].at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : undefined,
              },
            ]}
          />
          <Stats
            items={["queued", "running", "failed", "done"].map((status) => ({
              label: `${status[0]!.toUpperCase()}${status.slice(1)} jobs`,
              value:
                health.data!.statuses.find((row) => row.status === status)?.n ??
                0,
              alert: status === "failed" && (health.data!.statuses.find((row) => row.status === status)?.n ?? 0) > 0,
            }))}
          />
        </>
      )}
      {!id &&
        ["users", "workspaces", "activity", "health"].includes(section) && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full max-w-xs">
                <RiSearchLine className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                <Input
                  aria-label={
                    section === "health"
                      ? "Search errors and webhook deliveries"
                      : `Search ${section}`
                  }
                  placeholder={
                    section === "health"
                      ? "Search errors and deliveries…"
                      : `Search ${section}…`
                  }
                  className="h-9 rounded ps-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {section === "users" && (
                <Tabs
                  value={status}
                  onValueChange={(v) => {
                    setStatus(v as typeof status);
                    setOffset(0);
                  }}
                >
                  <TabsList aria-label="Account status">
                    {(["all", "active", "suspended"] as const).map((v) => (
                      <TabsTrigger key={v} value={v} className="px-3 capitalize">
                        {v === "all" ? "Everyone" : v}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
              {section === "health" && (
                <Select
                  value={webhookResult}
                  onValueChange={(v) => {
                    setWebhookResult(v as typeof webhookResult);
                    setWebhooksOffset(0);
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All deliveries</SelectItem>
                    <SelectItem value="ok">Delivered</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="signature_rejected">
                      Signature rejected
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <Panel flush
              title={
                section === "health"
                  ? "Failed background jobs"
                  : (() => {
                      const n = tableQuery.data?.total;
                      const noun = { users: ["user", "users"], workspaces: ["workspace", "workspaces"], activity: ["admin change", "admin changes"] }[
                        section as "users" | "workspaces" | "activity"
                      ];
                      return n === undefined ? "Loading…" : `${n.toLocaleString()} ${noun[n === 1 ? 0 : 1]}`;
                    })()
              }
              description={
                section === "health"
                  ? "Only safe sync jobs can be retried. Raw payloads and errors are withheld to protect credentials."
                  : section === "activity" ? "Newest first." : "Click a row to open it."
              }
            >
              <State
                pending={tableQuery.isPending}
                error={tableQuery.error}
                empty={tableQuery.data?.total === 0}
              />
              {section === "users" && users.data && (
                <DataTable
                  headers={[
                    "Person",
                    "Status",
                    "Registered",
                    "Last product activity",
                    "",
                  ]}
                >
                  {users.data.rows.map((u) => (
                    <TableRow key={u.id} className="relative cursor-pointer">
                      <TableCell>
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="flex items-center gap-3 after:absolute after:inset-0"
                        >
                          <span aria-hidden>
                            <PersonAvatar seed={u.id} name={u.name} className="size-8" />
                          </span>
                          <span className="grid min-w-0 leading-tight">
                            <span className="truncate font-medium">{u.name}</span>
                            <span className="truncate text-xs text-muted-foreground">{u.email}</span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge>
                          {u.suspendedAt
                            ? "Suspended"
                            : u.emailVerified
                              ? "Active"
                              : "Unverified"}
                        </Badge>
                      </TableCell>
                      <TableCell>{date(u.createdAt)}</TableCell>
                      <TableCell>{date(u.lastActiveAt)}</TableCell>
                      <TableCell>
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          aria-label={`View ${u.name}`}
                        >
                          <Link href={`/admin/users/${u.id}`}>
                            <RiArrowRightLine />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              )}
              {section === "workspaces" && workspaces.data && (
                <DataTable
                  headers={[
                    "Workspace",
                    "Members",
                    "Access",
                    "Subscription",
                    "",
                  ]}
                >
                  {workspaces.data.rows.map((w) => (
                    <TableRow key={w.id} className="relative cursor-pointer">
                      <TableCell>
                        <Link
                          href={`/admin/workspaces/${w.id}`}
                          className="flex items-center gap-3 after:absolute after:inset-0"
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground uppercase">
                            {w.name.slice(0, 2)}
                          </span>
                          <span className="grid min-w-0 leading-tight">
                            <span className="truncate font-medium">{w.name}</span>
                            <span className="truncate font-mono text-xs text-muted-foreground">{w.slug}</span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">{w.members}</TableCell>
                      <TableCell>
                        <Badge>
                          {w.effectivePlan === "team" && w.paidPlan !== "team"
                            ? "Complimentary Team"
                            : w.effectivePlan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {w.subscriptionStatus ? <Badge>{w.subscriptionStatus}</Badge> : <span className="text-subtle">None</span>}
                      </TableCell>
                      <TableCell>
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          aria-label={`View ${w.name}`}
                        >
                          <Link href={`/admin/workspaces/${w.id}`}>
                            <RiArrowRightLine />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              )}
              {section === "activity" && audit.data && (
                <DataTable
                  headers={["Action", "Target", "Actor", "Reason", "When"]}
                >
                  {audit.data.rows.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.action}</TableCell>
                      <TableCell className="max-w-48 break-all">
                        {a.target}
                      </TableCell>
                      <TableCell className="max-w-48 break-all">
                        {a.actorName ?? a.actorId}
                        <span className="block text-caption-1-medium text-text-tertiary">
                          {a.actorEmail}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal">
                        {a.reason}
                      </TableCell>
                      <TableCell>{date(a.at)}</TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              )}
              {section === "health" && health.data && (
                <DataTable
                  headers={["Job", "Type", "Attempts", "Updated", "Action"]}
                >
                  {health.data.rows.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell>#{j.id}</TableCell>
                      <TableCell>{j.type}</TableCell>
                      <TableCell>{j.attempts}</TableCell>
                      <TableCell>{date(j.updatedAt)}</TableCell>
                      <TableCell>
                        {j.retryable && write ? (
                          <Button
                            variant="outline"
                            onClick={() =>
                              setAction({
                                kind: "retry",
                                target: String(j.id),
                                label: `Retry job #${j.id}`,
                              })
                            }
                          >
                            Retry sync
                          </Button>
                        ) : (
                          "Manual investigation"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              )}
              {tableQuery.data && (
                <Pager
                  total={tableQuery.data.total}
                  offset={offset}
                  setOffset={setOffset}
                />
              )}
            </Panel>
            {section === "health" && (
              <>
                <Panel flush
                  title={`${errors.data?.total ?? "…"} grouped errors`}
                  description="Repeat instances of the same bug share one row. Full stacks stay in this admin view."
                >
                  <State
                    pending={errors.isPending}
                    error={errors.error}
                    empty={errors.data?.total === 0}
                  />
                  {errors.data && errors.data.rows.length > 0 && (
                    <DataTable
                      headers={[
                        "Error",
                        "Occurrences",
                        "First seen",
                        "Last seen",
                        "",
                      ]}
                    >
                      {errors.data.rows.map((e) => (
                        <Fragment key={e.hash}>
                          <TableRow>
                            <TableCell className="max-w-64">
                              <span
                                className="block font-mono text-caption-1-medium text-text-tertiary"
                                title={e.hash}
                              >
                                {e.hash.slice(0, 12)}
                              </span>
                              <span className="mt-1 block break-all whitespace-normal">
                                {e.message}
                              </span>
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {e.total}
                            </TableCell>
                            <TableCell>{date(e.firstAt)}</TableCell>
                            <TableCell>{date(e.lastAt)}</TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                onClick={() =>
                                  setOpenError(
                                    openError === e.hash ? null : e.hash,
                                  )
                                }
                              >
                                {openError === e.hash ? "Hide" : "Stack"}
                              </Button>
                            </TableCell>
                          </TableRow>
                          {openError === e.hash && (
                            <TableRow key={`${e.hash}-stack`}>
                              <TableCell colSpan={5}>
                                <pre
                                  dir="ltr"
                                  className="max-h-64 overflow-auto rounded-md border border-separator-border bg-background-secondary-default p-4 font-mono text-caption-1-medium text-text-secondary whitespace-pre-wrap break-all"
                                >
                                  {e.stack ?? "No stack recorded."}
                                </pre>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                    </DataTable>
                  )}
                  {errors.data && (
                    <Pager
                      total={errors.data.total}
                      offset={errorsOffset}
                      setOffset={setErrorsOffset}
                    />
                  )}
                </Panel>
                <Panel flush
                  title={`${webhooks.data?.total ?? "…"} webhook deliveries`}
                  description={
                    webhooks.data
                      ? `${Math.round(webhooks.data.last24h.rate * 100)}% failed in the last 24 hours (${webhooks.data.last24h.failed} of ${webhooks.data.last24h.total} deliveries). Only delivery metadata is stored; payloads are never kept.`
                      : "Only delivery metadata is stored; payloads are never kept."
                  }
                >
                  <State
                    pending={webhooks.isPending}
                    error={webhooks.error}
                    empty={webhooks.data?.total === 0}
                  />
                  {webhooks.data && webhooks.data.rows.length > 0 && (
                    <DataTable
                      headers={[
                        "Event",
                        "Installation",
                        "Result",
                        "Reason",
                        "Delivery",
                        "Duration",
                        "Received",
                      ]}
                    >
                      {webhooks.data.rows.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell>{w.event}</TableCell>
                          <TableCell className="tabular-nums">
                            {w.installationId ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge>{w.result.replaceAll("_", " ")}</Badge>
                          </TableCell>
                          <TableCell className="max-w-64 whitespace-normal">
                            {w.reason ?? "—"}
                          </TableCell>
                          <TableCell className="max-w-48 break-all">
                            <span
                              dir="ltr"
                              className="font-mono text-caption-1-medium text-text-tertiary"
                            >
                              {w.deliveryId ?? "Not recorded"}
                            </span>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {w.durationMs} ms
                          </TableCell>
                          <TableCell>{date(w.receivedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </DataTable>
                  )}
                  {webhooks.data && (
                    <Pager
                      total={webhooks.data.total}
                      offset={webhooksOffset}
                      setOffset={setWebhooksOffset}
                    />
                  )}
                </Panel>
              </>
            )}
          </>
        )}
      {section === "users" && id && (
        <>
          <State pending={user.isPending} error={user.error} />
          {user.data && (
            <>
              <Panel title="Account" description={user.data.email}>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge>
                    {user.data.suspendedAt ? "Suspended" : "Active"}
                  </Badge>
                  <Badge>
                    {user.data.emailVerified
                      ? "Email verified"
                      : "Email unverified"}
                  </Badge>
                  <Badge>
                    {user.data.twoFactorEnabled
                      ? "2FA enabled"
                      : "2FA disabled"}
                  </Badge>
                  <span className="text-caption-1-medium text-text-tertiary">
                    Joined {date(user.data.createdAt)}
                  </span>
                </div>
                <p className="mt-4 text-body-2-regular text-text-secondary">
                  Sign-in methods:{" "}
                  {user.data.providers.map((p) => p.provider).join(", ") ||
                    "Not recorded"}
                </p>
                {user.data.suspensionReason && (
                  <p className="mt-3 text-body-2-regular">
                    Reason: {user.data.suspensionReason}
                  </p>
                )}
                <div className="mt-5 flex flex-wrap gap-3">
                  {owner && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        setAction({
                          kind: user.data.suspendedAt
                            ? "reactivate"
                            : "suspend",
                          target: id,
                          label: `${user.data.suspendedAt ? "Reactivate" : "Suspend"} ${user.data.name}`,
                        })
                      }
                    >
                      {user.data.suspendedAt
                        ? "Reactivate account"
                        : "Suspend account"}
                    </Button>
                  )}
                  {write && (
                    <Button
                      variant="outline"
                      disabled={!user.data.sessions.length}
                      onClick={() =>
                        setAction({
                          kind: "sessions",
                          target: id,
                          label: `Sign out ${user.data.name} everywhere`,
                        })
                      }
                    >
                      Revoke all sessions
                    </Button>
                  )}
                </div>
              </Panel>
              <Panel
                title="Sessions & devices"
                description="Browser and OS are inferred. Last activity is the session refresh time, not continuous device tracking."
              >
                <State pending={false} empty={!user.data.sessions.length} />
                <div className="grid gap-3">
                  {user.data.sessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center gap-4 rounded-md border border-separator-border p-4"
                    >
                      <RiComputerLine className="size-5 text-foreground-icon-secondary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-body-2-medium">{s.device}</p>
                        <p className="mt-1 text-caption-1-medium text-text-tertiary">
                          IP {s.ipAddress ?? "unknown"} · Last refresh{" "}
                          {date(s.updatedAt)}
                        </p>
                        <p className="mt-1 text-caption-1-medium text-text-tertiary">
                          Created {date(s.createdAt)} · Expires{" "}
                          {date(s.expiresAt)}
                        </p>
                      </div>
                      {write && (
                        <Button
                          variant="outline"
                          onClick={() =>
                            setAction({
                              kind: "sessions",
                              target: id,
                              sessionId: s.id,
                              label: `Revoke ${s.device} session`,
                            })
                          }
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Workspace memberships">
                <div className="grid gap-3">
                  {user.data.memberships.map((m) => (
                    <Link
                      key={m.id}
                      href={`/admin/workspaces/${m.id}`}
                      className="flex justify-between rounded-md border border-separator-border p-4"
                    >
                      <span>{m.name}</span>
                      <Badge>{m.role}</Badge>
                    </Link>
                  ))}
                </div>
              </Panel>
              <Panel flush title="Recent product activity">
                <DataTable headers={["Event", "When"]}>
                  {user.data.events.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell>{e.name}</TableCell>
                      <TableCell>{date(e.at)}</TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              </Panel>
              <Panel flush
                title="Recent logins"
                description="Historical logins before this feature was installed are unavailable."
              >
                <DataTable headers={["Event", "When"]}>
                  {user.data.logins.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.kind}</TableCell>
                      <TableCell>{date(e.at)}</TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              </Panel>
            </>
          )}
        </>
      )}
      {section === "workspaces" && id && (
        <>
          <State pending={workspace.isPending} error={workspace.error} />
          {workspace.data && (
            <>
              <Stats
                items={[
                  {
                    label: "Effective access",
                    value: workspace.data.effectivePlan,
                  },
                  { label: "Billing plan", value: workspace.data.plan },
                  { label: "Members", value: workspace.data.members.length },
                  {
                    label: "Repositories",
                    value: workspace.data.repositories.length,
                  },
                ]}
              />
              <Panel flush
                title="Billing & complimentary access"
                description="Complimentary grants are separate from the payment subscription."
              >
                <p className="text-body-2-regular text-text-secondary">
                  Subscription: {workspace.data.subscriptionStatus ?? "None"} ·
                  Current period ends: {date(workspace.data.currentPeriodEnd)}
                </p>
                {workspace.data.billingSubscriptionId && (
                  <p className="mt-2 break-all text-caption-1-medium text-text-tertiary">
                    Subscription ID: {workspace.data.billingSubscriptionId}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                  {owner && (
                    <>
                      <Button
                        onClick={() =>
                          setAction({
                            kind: "grant",
                            target: id,
                            label: `Grant Team access to ${workspace.data.name}`,
                          })
                        }
                      >
                        Grant or extend premium
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setAction({
                            kind: "revokeGrant",
                            target: id,
                            label: `Revoke complimentary access for ${workspace.data.name}`,
                          })
                        }
                      >
                        Revoke grant
                      </Button>
                    </>
                  )}
                  <Button asChild variant="outline">
                    <a
                      href="https://app.dodopayments.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open payment provider ↗
                    </a>
                  </Button>
                </div>
                <div className="mt-5">
                  <DataTable
                    headers={["Granted", "Expires", "Status", "Reason"]}
                  >
                    {workspace.data.grants.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell>{date(g.startsAt)}</TableCell>
                        <TableCell>
                          {g.expiresAt ? date(g.expiresAt) : "Indefinite"}
                        </TableCell>
                        <TableCell>
                          {g.revokedAt
                            ? "Revoked"
                            : g.expiresAt && new Date(g.expiresAt) <= new Date()
                              ? "Expired"
                              : "Active"}
                        </TableCell>
                        <TableCell>{g.reason}</TableCell>
                      </TableRow>
                    ))}
                  </DataTable>
                </div>
              </Panel>
              <Panel flush title="People">
                <DataTable headers={["Person", "Email", "Role"]}>
                  {workspace.data.members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Link href={`/admin/users/${m.id}`}>{m.name}</Link>
                      </TableCell>
                      <TableCell>{m.email}</TableCell>
                      <TableCell>{m.role}</TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              </Panel>
              <Panel flush title="Repositories & integrations">
                <DataTable
                  headers={["Repository", "Status", "Last metadata update"]}
                >
                  {workspace.data.repositories.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>
                        {r.suspendedAt
                          ? "Installation suspended"
                          : r.enabled
                            ? "Enabled"
                            : "Disabled"}
                      </TableCell>
                      <TableCell>{date(r.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </DataTable>
                <p className="mt-4 text-body-2-regular text-text-secondary">
                  Slack:{" "}
                  {workspace.data.slack
                    .map((s) => `${s.name} / ${s.channel}`)
                    .join(", ") || "Not connected"}{" "}
                  · Linear:{" "}
                  {workspace.data.linear.map((l) => l.name).join(", ") ||
                    "Not connected"}
                </p>
              </Panel>
            </>
          )}
        </>
      )}
      {write && (
        <p className="text-caption-1-medium text-text-tertiary">
          Access changes require a sign-in within the last 30 minutes and a
          reason. Every successful change is recorded in the audit trail.
        </p>
      )}
      <ActionDialog
        key={
          action
            ? `${action.kind}:${action.target}:${action.sessionId ?? ""}`
            : "closed"
        }
        action={action}
        close={() => setAction(null)}
      />
    </div>
  );
}
