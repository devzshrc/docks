"use client";

import { RiSearchLine, RiTimeLine, RiUserAddLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Face, type Presence } from "@/components/people/face";
import { InviteDialog } from "@/components/people/invite-dialog";
import { QueryError } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

type Person = {
  userId: string;
  name: string;
  image: string | null;
  role: string;
  githubLogin: string | null;
  away: boolean;
  awayUntil: string | null;
  openReviews: number;
  maxOpenReviews: number | null;
  oldestWaitingSince: Date | string | null;
  overLimit: boolean;
  teams: { id: string; name: string }[];
};

function waited(d: Date | string | null) {
  if (!d) return "";
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3_600_000);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

const shortDate = (d: string) =>
  new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const presenceOf = (p: Person): Presence => (p.away ? "away" : p.overLimit ? "busy" : "available");
const PRESENCE_LABEL: Record<Presence, string> = { available: "Available", busy: "At review limit", away: "Away" };

/** Circular load meter: open reviews against their limit (or the busiest person when there's no limit). */
function LoadRing({ value, max, warn }: { value: number; max: number; warn: boolean }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const share = max ? Math.min(1, value / max) : 0;
  return (
    <span className="relative grid size-10 shrink-0 place-items-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-muted" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - share)}
          className={cn("ring-fill transition-[stroke-dashoffset] duration-700 ease-power3-out", warn ? "stroke-warning" : "stroke-primary")}
          style={{ ["--ring-empty" as string]: `${c}px` }}
        />
      </svg>
      <span className="text-[13px] font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function PersonCard({ p, scale }: { p: Person; scale: number }) {
  const presence = presenceOf(p);
  const limit = p.maxOpenReviews ?? scale;
  return (
    <li>
      <Link
        href={`/people/${p.userId}`}
        className="group flex h-full flex-col gap-4 rounded-md bg-card p-4 surface-raised transition-[box-shadow,transform] duration-200 ease-power3-out hover:-translate-y-px hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none active:translate-y-0"
      >
        <div className="flex items-start gap-3">
          <Face seed={p.userId} name={p.name} src={p.image} githubLogin={p.githubLogin} presence={presence} />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-sm font-medium">{p.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {p.githubLogin ? `@${p.githubLogin}` : "GitHub not linked"}
            </p>
          </div>
          <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">{p.role}</span>
        </div>

        <div className="flex items-center gap-3 rounded-md bg-muted/60 p-2.5">
          <LoadRing value={p.openReviews} max={limit} warn={p.overLimit} />
          <div className="min-w-0 text-xs leading-[1.35]">
            <p className="font-medium text-foreground">
              {p.openReviews === 0 ? "No open reviews" : `${p.openReviews} open ${p.openReviews === 1 ? "review" : "reviews"}`}
              {p.maxOpenReviews ? <span className="font-normal text-subtle"> · limit {p.maxOpenReviews}</span> : null}
            </p>
            <p className={cn("flex items-center gap-1", presence === "busy" ? "text-warning" : "text-muted-foreground")}>
              {p.away ? (
                p.awayUntil ? `Away until ${shortDate(p.awayUntil)}` : "Away"
              ) : p.oldestWaitingSince && p.openReviews > 0 ? (
                <>
                  <RiTimeLine className="size-3" aria-hidden />
                  Oldest waiting {waited(p.oldestWaitingSince)}
                </>
              ) : (
                PRESENCE_LABEL[presence]
              )}
            </p>
          </div>
        </div>

        {p.teams.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1">
            {p.teams.map((t) => (
              <span key={t.id} className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground shadow-[inset_0_0_0_1px_rgb(15_23_42/0.07)]">
                {t.name}
              </span>
            ))}
          </div>
        )}
      </Link>
    </li>
  );
}

function Summary({ people, viewers, onInvite }: { people: Person[]; viewers: number; onInvite: () => void }) {
  const open = people.reduce((n, p) => n + p.openReviews, 0);
  const busiest = [...people].sort((a, b) => b.openReviews - a.openReviews)[0];
  const atLimit = people.filter((p) => p.overLimit).length;
  const away = people.filter((p) => p.away).length;
  const stack = people.slice(0, 5);
  return (
    <section className="flex flex-col gap-5 rounded-md bg-card p-5 surface-raised sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className="group/stack flex shrink-0 -space-x-2.5">
          {stack.map((p, i) => (
            <span
              key={p.userId}
              className="transition-transform duration-200 ease-power3-out group-hover/stack:translate-x-[calc(var(--i)*4px)]"
              style={{ ["--i" as string]: i, zIndex: stack.length - i }}
            >
              <Face seed={p.userId} name={p.name} src={p.image} githubLogin={p.githubLogin} className="size-9 rounded-full ring-2 ring-card" />
            </span>
          ))}
          {people.length > stack.length && (
            <span className="z-0 grid size-9 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground ring-2 ring-card">
              +{people.length - stack.length}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {people.length} {people.length === 1 ? "person" : "people"} · {open} open {open === 1 ? "review" : "reviews"}
          </p>
          <p className="text-sm text-muted-foreground">
            {open === 0
              ? "Nobody is waiting on a review right now."
              : `${busiest!.name.split(" ")[0]} has the most (${busiest!.openReviews}).`}
            {atLimit > 0 && <span className="text-warning"> {atLimit} at their limit.</span>}
            {away > 0 && ` ${away} away.`}
          </p>
          {viewers > 0 && (
            <p className="text-xs text-subtle">
              {viewers} read-only {viewers === 1 ? "viewer isn't" : "viewers aren't"} shown, since viewers don&apos;t review.
            </p>
          )}
        </div>
      </div>
      <Button onClick={onInvite} size="lg" className="shrink-0">
        <RiUserAddLine />
        Invite people
      </Button>
    </section>
  );
}

function Load({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const people = useQuery(trpc.people.list.queryOptions({ workspaceId }));
  const teams = useQuery(trpc.people.teams.queryOptions({ workspaceId }));
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [inviting, setInviting] = useState(false);

  const all = useMemo(() => (people.data ?? []).filter((p) => p.role !== "viewer") as Person[], [people.data]);
  const scale = Math.max(1, ...all.map((p) => p.openReviews));
  const visible = all
    .filter((p) =>
      filter === "all" ? true : filter === "away" ? p.away : filter === "busy" ? p.overLimit : p.teams.some((t) => t.id === filter),
    )
    .filter((p) => `${p.name} ${p.githubLogin ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => b.openReviews - a.openReviews || a.name.localeCompare(b.name));

  if (people.isPending || teams.isPending)
    return (
      <div className="grid gap-5">
        <Skeleton className="h-[84px] rounded-md" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[172px] rounded-md" />
          ))}
        </div>
      </div>
    );
  if (people.error) return <QueryError error={people.error} onRetry={() => void people.refetch()} />;

  const filters = [
    { value: "all", label: "Everyone", count: all.length },
    ...(teams.data ?? []).map((t) => ({ value: t.id, label: t.name, count: all.filter((p) => p.teams.some((x) => x.id === t.id)).length })),
    ...(all.some((p) => p.overLimit) ? [{ value: "busy", label: "At limit", count: all.filter((p) => p.overLimit).length }] : []),
    ...(all.some((p) => p.away) ? [{ value: "away", label: "Away", count: all.filter((p) => p.away).length }] : []),
  ];

  return (
    <div className="grid gap-5">
      <Summary people={all} viewers={(people.data ?? []).length - all.length} onInvite={() => setInviting(true)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {filters.length > 1 ? <Tabs value={filter} onValueChange={setFilter}>
          <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList aria-label="Filter people">
              {filters.map((f) => (
                <TabsTrigger key={f.value} value={f.value} className="px-3">
                  {f.label}
                  <span className="text-[11px] text-subtle tabular-nums">{f.count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs> : <span />}
        <label className="relative w-full sm:w-56">
          <span className="sr-only">Search people</span>
          <RiSearchLine className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or login"
            className="h-9 w-full rounded bg-secondary pr-3 pl-8 text-sm shadow-control transition-shadow outline-none placeholder:text-subtle focus:shadow-[0_0_0_1px_var(--primary),0_0_0_4px_color-mix(in_oklab,var(--primary)_15%,transparent)]"
          />
        </label>
      </div>

      {visible.length === 0 && filter !== "all" ? (
        <p className="rounded-md bg-card px-6 py-10 text-center text-sm text-muted-foreground surface-raised">Nobody matches this filter.</p>
      ) : (
        <ul key={filter} className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <PersonCard key={p.userId} p={p} scale={scale} />
          ))}
        </ul>
      )}

      <InviteDialog workspaceId={workspaceId} open={inviting} onOpenChange={setInviting} />
    </div>
  );
}

function Content() {
  const { workspace, isPending } = useWorkspace();
  if (isPending) return null;
  if (!workspace) return <p className="text-muted-foreground text-sm">You aren&apos;t in a workspace yet.</p>;
  return <Load workspaceId={workspace.id} />;
}

export default function Page() {
  return (
    <AppShell title="People" description="Who is reviewing what, and who has room for more.">
      <Content />
    </AppShell>
  );
}
