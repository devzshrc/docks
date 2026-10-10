"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RiArrowRightLine,
  RiSearchLine,
  RiRefreshLine,
  RiUserLine,
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
import { AdminTrendChart, AdminActivationChart } from "@/components/admin/admin-charts";
const date = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString() : "Not recorded";
function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-separator-border bg-background-secondary-default px-2 py-1 text-caption-1-medium text-text-secondary">
      {children}
    </span>
  );
}
function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default">
      <div className="border-b border-separator-border px-5 py-4">
        <h2 className="text-headline-medium">{title}</h2>
        {description && (
          <p className="mt-1 text-caption-1-medium text-text-tertiary">
            {description}
          </p>
        )}
      </div>
      <div className="p-5">{children}</div>
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
  if (pending) return <Skeleton className="h-40 w-full" />;
  if (error)
    return (
      <p
        role="alert"
        className="p-5 text-body-2-regular text-text-error-primary"
      >
        {error.message}
      </p>
    );
  if (empty)
    return (
      <p className="p-8 text-center text-body-2-regular text-text-tertiary">
        No records match this view.
      </p>
    );
  return null;
}
function Stats({
  items,
}: {
  items: { label: string; value: number | string; note?: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((s) => (
        <div
          key={s.label}
          className="rounded-3xl border border-border-button-default bg-background-primary-default p-5"
        >
          <p className="text-caption-1-medium text-text-secondary">{s.label}</p>
          <p className="mt-3 text-title-1-medium tabular-nums">{s.value}</p>
          {s.note && (
            <p className="mt-2 text-caption-1-medium text-text-tertiary">
              {s.note}
            </p>
          )}
        </div>
      ))}
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
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead
              key={h}
              className="text-caption-1-medium text-text-tertiary"
            >
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
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
  return (
    <div className="flex items-center justify-between gap-3 border-t border-separator-border pt-4 text-caption-1-medium text-text-tertiary">
      <span>
        {total
          ? `${offset + 1}–${Math.min(offset + 25, total)} of ${total}`
          : "0 records"}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 25))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={offset + 25 >= total}
          onClick={() => setOffset(offset + 25)}
        >
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
              {mutation.error.message}
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
    [openError, setOpenError] = useState<string | null>(null),
    [days, setDays] = useState(30),
    [status, setStatus] = useState<"all" | "active" | "suspended">("all");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setOffset(0);
      setErrorsOffset(0);
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
    trpc.admin.health.queryOptions(page, { enabled: section === "health" }),
  );
  const errors = useQuery(
    trpc.admin.errors.queryOptions(
      { search: debounced, offset: errorsOffset, limit: 25 },
      { enabled: section === "health" },
    ),
  );
  const write = !!access.data && access.data.role !== "viewer",
    owner = access.data?.role === "owner";
  const titles = {
    overview: "Your platform, at a glance",
    users: "People using Docks",
    workspaces: "Customer workspaces",
    usage: "How teams use Docks",
    activity: "Every change, accounted for",
    health: "Keep everything running",
  };
  const tableQuery =
    section === "users"
      ? users
      : section === "workspaces"
        ? workspaces
        : section === "activity"
          ? audit
          : health;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {id && (
            <Link
              href={`/admin/${section}`}
              className="text-caption-1-medium text-text-secondary"
            >
              ← All {section}
            </Link>
          )}
          <h1 className="mt-1 text-title-2-medium">
            {id
              ? section === "users"
                ? (user.data?.name ?? "User details")
                : (workspace.data?.name ?? "Workspace details")
              : titles[section]}
          </h1>
          <p className="mt-2 text-body-2-regular text-text-secondary">
            {id
              ? id
              : "Manage access, understand activity, and support your customers."}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            cache.invalidateQueries({ queryKey: trpc.admin.pathKey() })
          }
        >
          <RiRefreshLine />
          Refresh
        </Button>
      </div>
      {(section === "overview" || section === "usage") && (
        <>
          <div className="flex items-center gap-3">
            <Select
              value={String(days)}
              onValueChange={(v) => setDays(Number(v))}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[7, 30, 90].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    Last {n} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-caption-1-medium text-text-tertiary">
              UTC reporting · activity is event-based
            </span>
          </div>
          <State pending={overview.isPending} error={overview.error} />
          {overview.data && (
            <>
              <Stats
                items={[
                  { label: "Registered users", value: overview.data.users },
                  {
                    label: "New registrations",
                    value: overview.data.signups,
                    note: `${overview.data.previousSignups} in previous period`,
                  },
                  {
                    label: "Active users",
                    value: overview.data.active,
                    note: `${overview.data.previousActive} in previous period`,
                  },
                  { label: "Workspaces", value: overview.data.workspaces },
                ]}
              />
              <div className="grid gap-5 xl:grid-cols-2">
                <Panel
                  title="Registration trend"
                  description="Accounts created each day"
                >
                  <AdminTrendChart
                    rows={overview.data.days.map((d) => ({
                      label: d.day.slice(5),
                      value: d.n,
                    }))}
                    label="Registrations"
                    ariaLabel="Daily registrations"
                  />
                </Panel>
                <Panel
                  title="Activation journey"
                  description="Users registered in the selected period; each step follows the previous step"
                >
                  <AdminActivationChart values={overview.data.funnel} />
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
                description="Recorded events and distinct users; page views are not counted as active usage"
              >
                <DataTable headers={["Feature", "Events", "Users"]}>
                  {overview.data.features.map((f) => (
                    <TableRow key={f.name}>
                      <TableCell>{f.name.replaceAll("_", " ")}</TableCell>
                      <TableCell>{f.n}</TableCell>
                      <TableCell>{f.users}</TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              </Panel>
            </>
          )}
          {section === "usage" && (
            <Panel
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
        <Stats
          items={["queued", "running", "failed", "done"].map((status) => ({
            label: `${status[0]!.toUpperCase()}${status.slice(1)} jobs`,
            value:
              health.data!.statuses.find((row) => row.status === status)?.n ??
              0,
          }))}
        />
      )}
      {!id &&
        ["users", "workspaces", "activity", "health"].includes(section) && (
          <>
            <div className="flex flex-wrap gap-3">
              <div className="relative w-full max-w-sm">
                <RiSearchLine className="pointer-events-none absolute start-3 top-3 size-4 text-foreground-icon-tertiary" />
                <Input
                  aria-label={
                    section === "health"
                      ? "Search errors"
                      : `Search ${section}`
                  }
                  placeholder={
                    section === "health"
                      ? "Search errors…"
                      : `Search ${section}…`
                  }
                  className="h-10 ps-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {section === "users" && (
                <Select
                  value={status}
                  onValueChange={(v) => {
                    setStatus(v as typeof status);
                    setOffset(0);
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["all", "active", "suspended"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s === "all" ? "All accounts" : s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Panel
              title={
                section === "health"
                  ? "Failed background jobs"
                  : `${tableQuery.data?.total ?? "…"} ${section === "activity" ? "admin changes" : section}`
              }
              description={
                section === "health"
                  ? "Only safe sync jobs can be retried. Raw payloads and errors are withheld to protect credentials."
                  : "Select a record to inspect details."
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
                    <TableRow key={u.id}>
                      <TableCell>
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="flex items-center gap-3"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background-tertiary-default">
                            <RiUserLine />
                          </span>
                          <span className="grid gap-1">
                            <span className="text-body-2-medium">{u.name}</span>
                            <span className="text-caption-1-medium text-text-tertiary">
                              {u.email}
                            </span>
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
                    <TableRow key={w.id}>
                      <TableCell>
                        <Link
                          href={`/admin/workspaces/${w.id}`}
                          className="grid gap-1"
                        >
                          <span className="text-body-2-medium">{w.name}</span>
                          <span className="text-caption-1-medium text-text-tertiary">
                            {w.slug}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>{w.members}</TableCell>
                      <TableCell>
                        <Badge>
                          {w.effectivePlan === "team" && w.paidPlan !== "team"
                            ? "Complimentary Team"
                            : w.effectivePlan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {w.subscriptionStatus ?? "No subscription"}
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
              <Panel
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
                                setOpenError(openError === e.hash ? null : e.hash)
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
                                className="max-h-64 overflow-auto rounded-xl border border-separator-border bg-background-secondary-default p-4 font-mono text-caption-1-medium text-text-secondary whitespace-pre-wrap break-all"
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
                      className="flex flex-wrap items-center gap-4 rounded-xl border border-separator-border p-4"
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
                      className="flex justify-between rounded-xl border border-separator-border p-4"
                    >
                      <span>{m.name}</span>
                      <Badge>{m.role}</Badge>
                    </Link>
                  ))}
                </div>
              </Panel>
              <Panel title="Recent product activity">
                <DataTable headers={["Event", "When"]}>
                  {user.data.events.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell>{e.name}</TableCell>
                      <TableCell>{date(e.at)}</TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              </Panel>
              <Panel
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
              <Panel
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
              <Panel title="People">
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
              <Panel title="Repositories & integrations">
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
