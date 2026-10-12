"use client";

import {
  RiBarChartBoxLine,
  RiBugLine,
  RiCalendarScheduleLine,
  RiGitPullRequestLine,
  RiInboxLine,
  RiRocketLine,
  RiSearchLine,
  RiSettings3Line,
  RiSparkling2Line,
  RiTeamLine,
  RiTimeLine,
  RiTimerLine,
  RiUserAddLine,
} from "@remixicon/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { AppIcon } from "@/components/app-icon";
import { StatCards } from "@/components/application/dashboard/stat-cards";
import { TrendChart } from "@/components/charts/trend-chart";
import { Face } from "@/components/people/face";
import { SideSection } from "@/components/review/side-section";
import { Badge } from "@/components/ui/badge";
import { HueIcon, type Hue } from "@/components/ui/empty-preview";
import { cn } from "@/lib/utils";

/* The landing hero preview: a read-only replica of the real app, built from the product's own
 * components and tokens so it looks like Docks and follows the light/dark theme. Drawn at a fixed
 * 1200×750 (16:10) and scaled to fit, so density matches the real app on any screen. */

const W = 1200;
const H = 750;
const ROTATE_MS = 7000;

type View = "inbox" | "review" | "insights" | "team";
const VIEWS: { id: View; label: string; caption: string }[] = [
  { id: "inbox", label: "Inbox", caption: "Every pull request that needs you, oldest wait first." },
  { id: "review", label: "Guided review", caption: "A summary and a reading order for each change, with deadlines alongside." },
  { id: "insights", label: "Insights", caption: "How fast reviews move, with a plain takeaway on every week." },
  { id: "team", label: "People", caption: "Who is reviewing what, and who has room for more." },
];

const NAV: { title?: string; items: { id: View | string; label: string; icon: typeof RiInboxLine; tint: string; count?: number }[] }[] = [
  {
    items: [
      { id: "inbox", label: "Inbox", icon: RiInboxLine, tint: "text-hue-blue", count: 4 },
      { id: "review", label: "Reviews", icon: RiGitPullRequestLine, tint: "text-hue-indigo", count: 6 },
      { id: "issues", label: "Issues", icon: RiBugLine, tint: "text-hue-green" },
    ],
  },
  {
    title: "Planning",
    items: [
      { id: "deadlines", label: "Deadlines", icon: RiCalendarScheduleLine, tint: "text-hue-amber" },
      { id: "releases", label: "Releases", icon: RiRocketLine, tint: "text-hue-pink" },
    ],
  },
  {
    title: "Team",
    items: [
      { id: "insights", label: "Insights", icon: RiBarChartBoxLine, tint: "text-hue-teal" },
      { id: "team", label: "People", icon: RiTeamLine, tint: "text-hue-orange" },
    ],
  },
];

const HEADER: Record<View, { title: string; icon: typeof RiInboxLine; hue: Hue }> = {
  inbox: { title: "Inbox", icon: RiInboxLine, hue: "blue" },
  review: { title: "acme/api #482", icon: RiGitPullRequestLine, hue: "indigo" },
  insights: { title: "Insights", icon: RiBarChartBoxLine, hue: "teal" },
  team: { title: "People", icon: RiTeamLine, hue: "orange" },
};

/* ---------- shell (mirrors components/app-shell.tsx) ---------- */

function Shell({ view, children }: { view: View; children: ReactNode }) {
  const head = HEADER[view];
  return (
    <div className="flex h-full bg-background text-foreground">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 border-b border-sidebar-border bg-sidebar-accent p-3">
          <AppIcon className="size-8 shrink-0" />
          <span className="grid gap-1 leading-none">
            <span className="text-sm font-medium text-foreground">Acme</span>
            <span className="text-xs text-subtle">Code review workspace</span>
          </span>
        </div>
        {NAV.map((g, i) => (
          <div key={g.title ?? i} className={cn("grid gap-0 p-3", i < NAV.length - 1 && "border-b border-sidebar-border")}>
            {g.title && <p className="flex h-6 items-center text-[11px] font-medium tracking-[0.08em] text-faint uppercase">{g.title}</p>}
            {g.items.map((n) => {
              const on = n.id === view;
              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-lg px-2 text-sm",
                    on ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground shadow-control" : "text-sidebar-foreground",
                  )}
                >
                  <n.icon className={cn("size-3.5 shrink-0", n.tint)} />
                  <span className="truncate">{n.label}</span>
                  {n.count ? <span className="ml-auto text-xs text-subtle tabular-nums">{n.count}</span> : null}
                </div>
              );
            })}
          </div>
        ))}
        <div className="mt-auto grid gap-0 border-t border-sidebar-border p-3">
          {[
            { icon: RiSettings3Line, label: "Settings" },
            { icon: RiUserAddLine, label: "Invite teammates" },
          ].map((n) => (
            <div key={n.label} className="flex h-8 items-center gap-2 rounded-lg px-2 text-sm">
              <n.icon className="size-3.5 text-subtle" />
              {n.label}
            </div>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[58px] shrink-0 items-center gap-2.5 border-b px-5">
          <HueIcon icon={head.icon} hue={head.hue} className="size-6 rounded-md [&_svg]:size-3" />
          <h1 className="text-base leading-none font-medium">{head.title}</h1>
          <span className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-muted/70 py-[3px] pr-[7px] pl-[5px] text-xs leading-none">
            <span className="size-1.5 rounded-full bg-status" />
            Team
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="grid size-[30px] place-items-center rounded-full bg-secondary text-muted-foreground shadow-control">
              <RiSearchLine className="size-3.5" />
            </span>
            <Face seed="preview-you" name="You" className="size-[30px]" />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden px-5 py-6">{children}</div>
      </div>
    </div>
  );
}

/* ---------- views ---------- */

const PRS = [
  { title: "Rate-limit login attempts", repo: "acme/api", n: 482, meta: "Waiting 26h · Maya requested you", tone: "danger" as const, label: "Overdue", add: 84, del: 12 },
  { title: "Move billing to server components", repo: "acme/web", n: 1291, meta: "Waiting 4h · Leo requested you", tone: "warning" as const, label: "Due in 2h", add: 312, del: 198 },
  { title: "Export audit log as CSV", repo: "acme/web", n: 1288, meta: "Waiting 2h · Priya requested you", tone: "info" as const, label: "Due tomorrow", add: 141, del: 9 },
  { title: "Pin Postgres to 16.4 in CI", repo: "acme/infra", n: 77, meta: "Changes since your review · Sam", tone: "success" as const, label: "Re-review", add: 6, del: 2 },
  { title: "Retry webhook deliveries with backoff", repo: "acme/api", n: 479, meta: "Waiting 1h · Jonas requested you", tone: "info" as const, label: "Due Friday", add: 58, del: 14 },
  { title: "Add keyboard shortcuts to the board", repo: "acme/web", n: 1285, meta: "Waiting 40m · Ana requested you", tone: "info" as const, label: "Due Friday", add: 203, del: 31 },
];

function InboxView() {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">Review requests, replies, and changes that need your attention.</p>
      <div className="inline-flex h-9 w-fit items-center rounded-full bg-muted/70 p-[3px] text-xs font-medium text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]">
        {["Needs my review", "Changes since my review", "My PRs", "Overdue", "Snoozed"].map((t, i) => (
          <span key={t} className={cn("rounded-full px-3.5 py-1.5", i === 0 && "bg-secondary text-foreground shadow-control")}>
            {t}
          </span>
        ))}
      </div>
      <ul className="grid gap-2">
        {PRS.map((pr) => (
          <li key={pr.n} className="flex items-center gap-3 rounded-2xl p-4 surface-raised">
            <div className="grid min-w-0 flex-1 gap-1">
              <p className="truncate text-sm font-medium">{pr.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">
                  {pr.repo} #{pr.n}
                </span>{" "}
                · {pr.meta}
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums">
              <span className="text-success">+{pr.add}</span> <span className="text-danger">−{pr.del}</span>
            </span>
            <Badge variant="secondary" data-tone={pr.tone}>
              {pr.label}
            </Badge>
            <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-primary glass-sheen">Open</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DIFF: { kind: "hunk" | "add" | "del" | "ctx"; text: string }[] = [
  { kind: "hunk", text: "@@ -12,9 +12,16 @@ export async function login(c: Context) {" },
  { kind: "ctx", text: "  const { email, password } = await c.req.json()" },
  { kind: "add", text: "  const ip = c.req.header(\"cf-connecting-ip\") ?? \"unknown\"" },
  { kind: "add", text: "  if (!take(`login:${ip}`)) {" },
  { kind: "add", text: "    c.header(\"Retry-After\", \"60\")" },
  { kind: "add", text: "    return c.json({ error: \"Too many attempts\" }, 429)" },
  { kind: "add", text: "  }" },
  { kind: "del", text: "  const user = await db.execute(sql`select * from users where email = ${email}`)" },
  { kind: "add", text: "  const user = await db.select().from(users).where(eq(users.email, email))" },
  { kind: "ctx", text: "  if (!user || !(await verify(user.hash, password))) {" },
  { kind: "ctx", text: "    return c.json({ error: \"Invalid credentials\" }, 401)" },
  { kind: "ctx", text: "  }" },
];
const ROW = { hunk: "bg-info-bg/50 text-muted-foreground", add: "bg-success/10", del: "bg-danger/10", ctx: "" };

function ReviewView() {
  return (
    <div className="grid h-full grid-cols-[1fr_300px] gap-5">
      <div className="min-w-0 overflow-hidden rounded-2xl surface-raised">
        <div className="flex items-center gap-2 border-b px-4 py-2.5 text-sm">
          <span className="font-mono text-[13px]">src/routes/login.ts</span>
          <span className="font-mono text-xs tabular-nums">
            <span className="text-success">+7</span> <span className="text-danger">−1</span>
          </span>
          <span className="ml-auto text-xs text-muted-foreground">Step 2 of 3</span>
        </div>
        <div className="font-code text-[12.5px] leading-[22px]">
          {DIFF.map((l, i) => (
            <div key={i} className={cn("flex", ROW[l.kind])}>
              <span className="w-10 shrink-0 pr-2 text-right text-subtle select-none tabular-nums">{l.kind === "hunk" ? "" : 12 + i}</span>
              <span className="w-4 shrink-0 text-subtle">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}</span>
              <span className="truncate whitespace-pre">{l.text}</span>
            </div>
          ))}
        </div>
        <div className="m-3 grid gap-2 rounded-md border bg-background p-3 text-sm">
          <div className="flex items-center gap-2">
            <Face seed="preview-you" name="You" className="size-5" />
            <span className="font-medium">You</span>
            <span className="rounded px-1.5 py-px text-[10.5px] font-medium bg-primary/15 text-info-text">question</span>
          </div>
          <p className="text-muted-foreground">Should the window reset per account as well as per IP?</p>
        </div>
      </div>
      <div className="grid content-start gap-4 rounded-2xl p-4 surface-raised">
        <SideSection
          label={
            <span className="inline-flex items-center gap-1.5">
              <RiSparkling2Line className="size-3.5 text-primary" />
              AI summary
            </span>
          }
        >
          <p className="text-sm leading-relaxed">Adds per-IP rate limiting to login and moves the user lookup to the query builder, with a unit test for the limiter.</p>
        </SideSection>
        <SideSection label="Review path" action={<span className="text-[11px] text-subtle">3 steps</span>}>
          <ol className="-mx-1 grid gap-0.5">
            {[
              { t: "Rate limiter", f: 1 },
              { t: "Login route", f: 2, on: true },
              { t: "Tests", f: 1 },
            ].map((s, i) => (
              <li key={s.t} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm", s.on && "bg-card shadow-control")}>
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full text-[11px] font-medium",
                    s.on ? "bg-primary text-primary-foreground" : i === 0 ? "bg-success text-white" : "bg-muted text-muted-foreground",
                  )}
                >
                  {i === 0 ? "✓" : i + 1}
                </span>
                <span className="flex-1 font-medium">{s.t}</span>
                <span className="text-[11px] text-subtle">
                  {s.f} file{s.f > 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ol>
        </SideSection>
        <SideSection label="Deadline">
          <div className="grid gap-2 rounded-xl bg-muted/50 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">First review</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                <span className="size-1.5 rounded-full bg-current" />
                Overdue
              </span>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RiTimeLine className="size-3.5" />
              Was due 3h ago
            </p>
          </div>
        </SideSection>
      </div>
    </div>
  );
}

const TREND = [3, 4, 4, 5, 4, 6, 5, 7, 6, 8, 7, 9].map((value, i) => ({
  label: new Date(Date.UTC(2026, 6, 20 + i * 7)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  value,
}));
const FIRST_REVIEW = [11, 9.5, 10, 8, 8.5, 7, 7.5, 6, 6.5, 5, 5.2, 4.2].map((value, i) => ({ label: TREND[i]!.label, value }));

function InsightsView() {
  return (
    <div className="grid gap-4">
      <StatCards
        stats={[
          { icon: RiTimerLine, label: "Time to first review", value: "4.2h", description: "median · down from 6.8h", deltaColor: "neutral" },
          { icon: RiGitPullRequestLine, label: "Opened to merged", value: "1.6d", description: "median · 38 merged", deltaColor: "neutral" },
          { icon: RiInboxLine, label: "PRs opened", value: "41", description: "2 without a review", deltaColor: "neutral" },
          { icon: RiBarChartBoxLine, label: "PRs merged", value: "38", deltaColor: "neutral" },
        ]}
      />
      <div className="grid grid-cols-2 gap-4">
        {[
          { title: "Merged per week", rows: TREND, label: "PRs merged", polarity: "higher" as const, color: undefined, fmt: (v: number) => String(v) },
          { title: "Time to first review", rows: FIRST_REVIEW, label: "Median hours", polarity: "lower" as const, color: "var(--hue-teal)", fmt: (v: number) => `${v}h` },
        ].map((c) => (
          <section key={c.title} className="rounded-xl bg-card py-4 surface-raised">
            <div className="px-5 pb-3">
              <p className="text-sm font-medium">{c.title}</p>
              <p className="text-xs text-muted-foreground">Last 12 weeks · hover a week</p>
            </div>
            <div className="px-3">
              <TrendChart rows={c.rows} label={c.label} ariaLabel={c.title} polarity={c.polarity} color={c.color} format={c.fmt} height={190} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

const PEOPLE = [
  { id: "p-maya", name: "Maya Chen", login: "maya", role: "admin", open: 4, limit: 4, note: "At review limit", presence: "busy" as const },
  { id: "p-leo", name: "Leo Park", login: "leopark", role: "member", open: 2, limit: 5, note: "Oldest waiting 4h", presence: "available" as const },
  { id: "p-priya", name: "Priya Nair", login: "priya", role: "member", open: 1, limit: 4, note: "Oldest waiting 2h", presence: "available" as const },
  { id: "p-sam", name: "Sam Rivera", login: "samr", role: "member", open: 0, limit: 3, note: "Away until Oct 20", presence: "away" as const },
  { id: "p-jonas", name: "Jonas Weber", login: "jweber", role: "member", open: 3, limit: 5, note: "Oldest waiting 1d", presence: "available" as const },
  { id: "p-ana", name: "Ana Souza", login: "anas", role: "viewer", open: 0, limit: 3, note: "Available", presence: "available" as const },
];

function Ring({ value, max, warn }: { value: number; max: number; warn: boolean }) {
  const c = 2 * Math.PI * 15;
  return (
    <span className="relative grid size-10 shrink-0 place-items-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-muted" />
        <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / max)} className={warn ? "stroke-warning" : "stroke-primary"} />
      </svg>
      <span className="text-[13px] font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function TeamView() {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-4 rounded-xl p-4 surface-raised">
        <div className="flex -space-x-2.5">
          {PEOPLE.slice(0, 5).map((p, i) => (
            <span key={p.id} style={{ zIndex: 5 - i }}>
              <Face seed={p.id} name={p.name} className="size-9 rounded-full ring-2 ring-card" />
            </span>
          ))}
        </div>
        <div>
          <p className="text-sm font-medium">6 people · 10 open reviews</p>
          <p className="text-sm text-muted-foreground">
            Maya has the most (4). <span className="text-warning">1 at their limit.</span> 1 away.
          </p>
        </div>
      </div>
      <ul className="grid grid-cols-3 gap-3">
        {PEOPLE.map((p) => (
          <li key={p.id} className="grid gap-3.5 rounded-xl p-4 surface-raised">
            <div className="flex items-start gap-3">
              <Face seed={p.id} name={p.name} presence={p.presence} />
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">@{p.login}</p>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">{p.role}</span>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-2.5">
              <Ring value={p.open} max={p.limit} warn={p.open >= p.limit} />
              <div className="text-xs leading-[1.35]">
                <p className="font-medium">
                  {p.open ? `${p.open} open reviews` : "No open reviews"}
                  <span className="font-normal text-subtle"> · limit {p.limit}</span>
                </p>
                <p className={p.presence === "busy" ? "text-warning" : "text-muted-foreground"}>{p.note}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- frame ---------- */

/** Scales the fixed-size canvas to the width of its box; measured on mount so the first frame is right. */
function useFit() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setScale(el.clientWidth / W);
    const ro = new ResizeObserver(([e]) => setScale(e!.contentRect.width / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, scale };
}

export function ProductPreview() {
  const [view, setView] = useState<View>("inbox");
  const { ref, scale } = useFit();
  const hold = useRef(false);
  const visible = useRef(true);

  // Rotate slowly through the views while on screen; stop for good once someone picks one.
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    if (picked || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (hold.current || !visible.current || document.hidden) return;
      setView((v) => VIEWS[(VIEWS.findIndex((x) => x.id === v) + 1) % VIEWS.length]!.id);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [picked]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => (visible.current = e!.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  const pick = useCallback((v: View) => {
    setPicked(true);
    setView(v);
  }, []);

  const active = VIEWS.find((v) => v.id === view)!;
  const body = { inbox: <InboxView />, review: <ReviewView />, insights: <InsightsView />, team: <TeamView /> }[view];

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <div
        onMouseEnter={() => (hold.current = true)}
        onMouseLeave={() => (hold.current = false)}
        className="rounded-[20px] bg-[var(--l-frame)] p-2 shadow-[0_0_0_1px_var(--l-frame-edge),0_1px_2px_rgb(0_0_0/0.04),0_24px_60px_-24px_var(--l-frame-shadow)] md:p-2.5"
      >
        <div ref={ref} className="relative aspect-[16/10] overflow-hidden rounded-[13px] bg-background shadow-[0_0_0_1px_var(--l-frame-edge)]">
          <div className="absolute top-0 left-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }} inert aria-hidden>
            <Shell view={view}>
              <div key={view} className="h-full animate-in fade-in duration-300">
                {body}
              </div>
            </Shell>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <div className="max-w-full overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div role="tablist" aria-label="Product preview" className="flex w-max gap-1 rounded-full bg-[var(--l-surface)] p-1 shadow-[0_0_0_1px_var(--l-line)]">
            {VIEWS.map((v) => {
              const on = v.id === view;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => pick(v.id)}
                  className={cn(
                    "h-8 rounded-full px-4 text-[13px] whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[var(--l-blue)]",
                    on ? "bg-[var(--l-raised)] font-medium text-[var(--l-ink)] shadow-[0_0_0_1px_var(--l-line),0_1px_2px_rgb(0_0_0/0.06)]" : "text-[var(--l-ink-2)] hover:text-[var(--l-ink)]",
                  )}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>
        <p key={view} className="animate-in fade-in text-center text-[14px] text-[var(--l-ink-2)] duration-300" aria-live="polite">
          {active.caption}
        </p>
      </div>
    </div>
  );
}
