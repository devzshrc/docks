"use client";

import {
  RiCheckLine,
  RiGitPullRequestLine,
  RiGithubFill,
  RiInbox2Line,
  RiLineChartLine,
  RiRouteLine,
  RiSparkling2Line,
  RiTimerLine,
  RiUser3Line,
} from "@remixicon/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AppIcon } from "@/components/app-icon";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { cx } from "@/utils/cx";

/* The landing demo: one app window (16:10, like a laptop screen) that plays through what Docks does.
 * Everything is drawn at a fixed 880×550 and scaled to fit, so proportions hold on any screen. */

const W = 880;
const H = 550;
const SCENE_MS = 5200;

const SCENES = [
  { id: "queue", icon: RiInbox2Line, short: "Queue", title: "One queue", body: "Every pull request that needs you, ordered by who has waited longest." },
  { id: "guide", icon: RiRouteLine, short: "Guided review", title: "A path through the diff", body: "Docks summarises the change and walks you through files in the order that makes sense." },
  { id: "post", icon: RiGithubFill, short: "Post to GitHub", title: "Review, then post to GitHub", body: "Comments and approvals you leave in Docks land on the pull request in GitHub." },
  { id: "deadline", icon: RiTimerLine, short: "Deadlines", title: "Nothing waits too long", body: "Work-hour deadlines nudge reviewers, and a backup steps in when one slips." },
  { id: "insights", icon: RiLineChartLine, short: "Insights", title: "See how reviews flow", body: "Weekly trends with a plain takeaway, so you know what changed and why." },
] as const;

/** Drives the scene loop: current scene, time into it (0–1), jump on click. Paused off-screen; static under reduced motion. */
function useScenes() {
  const [scene, setScene] = useState(0);
  const [t, setT] = useState(0);
  const [still, setStill] = useState(false);
  const paused = useRef(false);
  const elapsed = useRef(0); // ms into the current scene, advanced only while playing
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStill(reduce);
    if (reduce) {
      setT(1);
      return;
    }
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(now - last, 250); // a throttled or sleeping tab doesn't skip ahead
      last = now;
      if (paused.current || document.hidden) return;
      elapsed.current += dt;
      if (elapsed.current >= SCENE_MS) {
        elapsed.current = 0;
        setScene((s) => (s + 1) % SCENES.length);
      }
      setT(elapsed.current / SCENE_MS);
    }, 50);
    return () => window.clearInterval(id);
  }, []);
  const jump = (i: number) => {
    elapsed.current = 0;
    setScene(i);
    setT(still ? 1 : 0);
  };
  const pause = useCallback((p: boolean) => {
    paused.current = p;
  }, []);
  return { scene, t, jump, still, pause };
}

/** Scales a fixed-size stage to the width of its box. */
function useFit() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setScale(el.clientWidth / W); // right on the first frame, before ResizeObserver reports
    const ro = new ResizeObserver(([e]) => setScale(e!.contentRect.width / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, scale };
}

const reveal = (on: boolean, delay = 0) => ({
  className: cx("transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]", on ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"),
  style: { transitionDelay: on ? `${delay}ms` : "0ms" },
});

/* ---------- shared app chrome inside the stage ---------- */

const NAV = [
  { id: "queue", icon: RiInbox2Line, label: "Inbox", count: 3 },
  { id: "guide", icon: RiGitPullRequestLine, label: "Reviews" },
  { id: "deadline", icon: RiTimerLine, label: "Deadlines", count: 1 },
  { id: "insights", icon: RiLineChartLine, label: "Insights" },
];

function Sidebar({ active }: { active: string }) {
  const on = active === "post" ? "guide" : active;
  return (
    <aside className="flex w-[196px] shrink-0 flex-col gap-1 border-r border-black/[0.06] bg-[#f8f8f9] p-3">
      <div className="mb-3 flex items-center gap-2 px-1.5">
        <span className="grid size-7 place-items-center rounded-lg bg-[#0b0b0c] text-[11px] font-semibold text-white">A</span>
        <div className="leading-tight">
          <p className="text-[12px] font-medium">Acme</p>
          <p className="text-[10px] text-[var(--l-ink-3)]">12 repositories</p>
        </div>
      </div>
      {NAV.map((n) => (
        <div
          key={n.id}
          className={cx("flex h-8 items-center gap-2 rounded-lg px-2 text-[12px] transition-[background-color,box-shadow,color] duration-300",
            on === n.id ? "bg-white font-medium text-[var(--l-ink)] shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.05)]" : "text-[var(--l-ink-2)]",
          )}
        >
          <n.icon className={cx("size-3.5", on === n.id ? "text-[var(--l-blue)]" : "text-[var(--l-ink-3)]")} />
          {n.label}
          {n.count ? <span className="ml-auto text-[10px] text-[var(--l-ink-3)] tabular-nums">{n.count}</span> : null}
        </div>
      ))}
    </aside>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-5 flex items-baseline gap-2.5">
      <p className="text-[15px] font-medium">{title}</p>
      <p className="text-[12px] text-[var(--l-ink-3)]">{sub}</p>
    </div>
  );
}

const card = "rounded-xl bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.04),0_8px_20px_-12px_rgb(15_23_42/0.12)]";

/* ---------- scenes ---------- */

const QUEUE = [
  { repo: "acme/api", title: "Rate-limit login attempts", who: "Maya", wait: "Waiting 26h", tone: "#f59e0b", add: 84, del: 12 },
  { repo: "acme/web", title: "Move billing to server components", who: "Leo", wait: "Your turn", tone: "#2f7bf5", add: 312, del: 198 },
  { repo: "acme/infra", title: "Pin Postgres to 16.4 in CI", who: "Sam", wait: "Ready to merge", tone: "#10b981", add: 6, del: 2 },
  { repo: "acme/web", title: "Export audit log as CSV", who: "Priya", wait: "Waiting 2h", tone: "#8b5cf6", add: 141, del: 9 },
  { repo: "acme/api", title: "Bump Next.js to 15.5", who: "Dependabot", wait: "Snoozed", tone: "#a1a1aa", add: 2, del: 2 },
];

function QueueScene({ t }: { t: number }) {
  // Beat 1: an older pull request arrives and takes the top spot.
  const arrived = t > 0.3;
  const rows = arrived ? QUEUE : QUEUE.slice(1);
  return (
    <div>
      <Heading title="Needs review" sub="Ordered by who has waited longest" />
      <div className="grid gap-2.5">
        {rows.map((r, i) => (
          <div
            key={r.title}
            className={cx(
              card,
              "flex items-center gap-4 px-4 py-3 transition-all duration-500",
              arrived && i === 0 && "animate-[demo-drop_600ms_cubic-bezier(0.25,1,0.5,1)] ring-2 ring-[#f59e0b]/30",
              r.wait === "Snoozed" && "opacity-55",
            )}
          >
            <span className="size-2 shrink-0 rounded-full" style={{ background: r.tone }} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{r.title}</p>
              <p className="text-[11px] text-[var(--l-ink-3)]">
                {r.repo} · {r.who}
              </p>
            </div>
            <span className="font-mono text-[11px] tabular-nums">
              <span className="text-[#16a34a]">+{r.add}</span> <span className="text-[#dc2626]">−{r.del}</span>
            </span>
            <span className={cx("w-[104px] rounded-full px-2 py-1 text-center text-[11px] font-medium", i === 0 && arrived ? "bg-[#f59e0b]/12 text-[#b45309]" : "bg-black/[0.04] text-[var(--l-ink-2)]")}>
              {r.wait}
            </span>
          </div>
        ))}
      </div>
      <p className={cx(reveal(t > 0.55).className, "mt-5 flex items-center gap-2 text-[12px] text-[var(--l-ink-2)]")}>
        <span className="grid size-5 place-items-center rounded-full bg-[#f59e0b]/15 text-[#b45309]">!</span>
        Maya has waited longest, so her pull request moves to the top.
      </p>
    </div>
  );
}

const STEPS = [
  {
    title: "Rate limiter",
    files: 1,
    lines: ["+ const LIMIT = 5", "+ const buckets = new Map<string, Bucket>()", "+ export function take(key: string) {", "+   const bucket = buckets.get(key) ?? fresh()", "+   if (bucket.count >= LIMIT) return false", "+   bucket.count += 1"],
  },
  {
    title: "Login route",
    files: 2,
    lines: ["+ if (!take(ip)) {", "+   c.header(\"Retry-After\", \"60\")", "+   return c.json({ error: \"slow down\" }, 429)", "+ }", "- const user = await db.query(sql`...`)", "+ const user = await db.select().from(users)"],
  },
  {
    title: "Tests",
    files: 1,
    lines: ["+ it(\"blocks the sixth attempt\", () => {", "+   for (let i = 0; i < 5; i++) take(ip)", "+   expect(take(ip)).toBe(false)", "+ })", "+ it(\"resets after a minute\", ...)", "+ // vitest.config.ts added"],
  },
];
const CHECKS = ["Limit resets each window", "429 sends Retry-After", "Tests cover the sixth try"];

function Diff({ lines, show }: { lines: readonly string[]; show: number }) {
  return (
    <div className="overflow-hidden rounded-lg bg-[#fbfbfa] font-mono text-[11.5px] leading-[24px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.05)]">
      {lines.map((l, i) => (
        <div
          key={l}
          className={cx("px-3 transition-[opacity,transform] duration-300",
            l.startsWith("-") ? "bg-[#fef2f2] text-[#b91c1c]" : "bg-[#f0fdf4] text-[#15803d]",
            i < show ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0",
          )}
        >
          {l}
        </div>
      ))}
    </div>
  );
}

function GuideScene({ t }: { t: number }) {
  const step = Math.min(2, Math.floor(t * 3.2));
  const local = t * 3.2 - step;
  return (
    <div className="grid h-full grid-cols-[240px_1fr] gap-5">
      <div className="grid content-start gap-3">
        <div className={cx(card, "p-3.5")}>
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium tracking-[0.04em] text-[var(--l-ink-3)] uppercase">
            <RiSparkling2Line className="size-3 text-[var(--l-blue)]" /> Summary
          </p>
          <p className="text-[12px] leading-[18px] text-[var(--l-ink-2)]">Adds per-IP rate limiting to login and a unit test for the limiter.</p>
        </div>
        <div className={cx(card, "grid gap-0.5 p-2")}>
          {STEPS.map((s, i) => (
            <div key={s.title} className={cx("flex items-center gap-2.5 rounded-lg px-2 py-2 text-[12px] transition-all duration-300", i === step && "bg-[#2f7bf5]/[0.07]")}>
              <span
                className={cx("grid size-5 place-items-center rounded-full text-[10px] font-medium transition-colors duration-300",
                  i < step ? "bg-[#16a34a] text-white" : i === step ? "bg-[var(--l-blue)] text-white" : "bg-black/[0.05] text-[var(--l-ink-3)]",
                )}
              >
                {i < step ? <RiCheckLine className="size-3" /> : i + 1}
              </span>
              <span className={cx("flex-1", i === step && "font-medium")}>{s.title}</span>
              <span className="text-[10px] text-[var(--l-ink-3)]">
                {s.files} file{s.files > 1 ? "s" : ""}
              </span>
            </div>
          ))}
        </div>
        <div className={cx(card, "grid gap-2 p-3.5")}>
          <p className="text-[10px] font-medium tracking-[0.04em] text-[var(--l-ink-3)] uppercase">Checklist</p>
          {CHECKS.map((c, i) => {
            const done = i < step || (i === step && local > 0.8);
            return (
              <p key={c} className="flex items-center gap-2 text-[12px]">
                <span className={cx("grid size-4 place-items-center rounded-[5px] transition-colors duration-300", done ? "bg-[#16a34a] text-white" : "shadow-[inset_0_0_0_1.5px_rgb(0_0_0/0.15)]")}>
                  {done && <RiCheckLine className="size-3" />}
                </span>
                <span className={cx("transition-colors", done ? "text-[var(--l-ink-3)] line-through" : "text-[var(--l-ink-2)]")}>{c}</span>
              </p>
            );
          })}
        </div>
      </div>
      <div className="min-w-0">
        <Heading title={`Step ${step + 1} · ${STEPS[step]!.title}`} sub="Read these files together" />
        <div key={step} className="animate-[demo-in_400ms_ease-out]">
          <p className="mb-2 font-mono text-[11px] text-[var(--l-ink-3)]">{["src/limiter.ts", "src/routes/login.ts", "src/limiter.test.ts"][step]}</p>
          <Diff lines={STEPS[step]!.lines} show={Math.max(2, Math.ceil(local * 9))} />
        </div>
      </div>
    </div>
  );
}

function PostScene({ t }: { t: number }) {
  const comment = "Should the window reset per user, not per IP?";
  const typed = comment.slice(0, Math.max(0, Math.round(((t - 0.12) / 0.38) * comment.length)));
  const approved = t > 0.62;
  const posted = t > 0.74;
  return (
    <div className="relative h-full">
      <Heading title="src/routes/login.ts" sub="acme/api #482" />
      <Diff lines={STEPS[1]!.lines.slice(0, 4)} show={4} />
      <div className={cx(card, "mt-3 ml-10 max-w-[520px] p-3")}>
        <div className="flex items-start gap-2.5">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#dbeafe] text-[10px] font-semibold text-[#1d4ed8]">Y</span>
          <p className="min-h-[18px] flex-1 pt-0.5 text-[12.5px] leading-[18px]">
            {typed}
            {t < 0.55 && <span className="ml-px inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-[var(--l-ink)]" />}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="rounded-full bg-white px-3.5 py-1.5 text-[12px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]">Comment</span>
        <span
          className={cx("inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium text-white transition-all duration-300",
            approved ? "scale-[0.97] bg-[#16a34a] shadow-[0_0_0_4px_rgb(22_163_74/0.15)]" : "bg-[var(--l-blue)]",
          )}
        >
          <RiCheckLine className="size-3.5" />
          {approved ? "Approved" : "Approve"}
        </span>
      </div>
      <div
        className={cx("absolute right-0 bottom-0 flex items-center gap-3 rounded-xl bg-[#0b0b0c] px-4 py-3 text-white shadow-[0_12px_30px_-10px_rgb(0_0_0/0.4)] transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]",
          posted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
      >
        <RiGithubFill className="size-5" />
        <div className="leading-tight">
          <p className="text-[12.5px] font-medium">Posted to GitHub</p>
          <p className="text-[11px] text-white/60">1 comment and an approval on acme/api #482</p>
        </div>
        <RiCheckLine className="size-4 text-[#4ade80]" />
      </div>
    </div>
  );
}

function DeadlineScene({ t }: { t: number }) {
  const left = Math.max(0, 1 - t / 0.45); // the clock runs out over the first half
  const overdue = left === 0;
  const backup = t > 0.62;
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div>
      <Heading title="Deadlines" sub="Counted in reviewers' working hours" />
      <div className={cx(card, "flex items-center gap-5 p-5")}>
        <svg viewBox="0 0 72 72" className="size-[72px] shrink-0 -rotate-90">
          <circle cx="36" cy="36" r={r} fill="none" strokeWidth="6" stroke="rgb(0 0 0 / 0.06)" />
          <circle
            cx="36"
            cy="36"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - left)}
            stroke={overdue ? "#dc2626" : left < 0.35 ? "#f59e0b" : "#2f7bf5"}
            className="transition-[stroke] duration-300"
          />
        </svg>
        <div className="flex-1">
          <p className="text-[13px] font-medium">First review · Move billing to server components</p>
          <p className={cx("mt-1 text-[12px] transition-colors", overdue ? "font-medium text-[#dc2626]" : "text-[var(--l-ink-2)]")}>
            {overdue ? "Overdue · Leo was asked 8 working hours ago" : `Due in ${Math.max(1, Math.round(left * 8))}h of Leo's working time`}
          </p>
        </div>
        <span className={cx("rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-300", overdue ? "bg-[#dc2626]/10 text-[#dc2626]" : "bg-[#2f7bf5]/10 text-[#1f66da]")}>
          {overdue ? "Overdue" : "On track"}
        </span>
      </div>
      <div className={cx(card, "mt-3 flex items-center gap-3 p-4 transition-all duration-500", backup ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")}>
        <span className="grid size-8 place-items-center rounded-full bg-[#ede9fe] text-[12px] font-semibold text-[#6d28d9]">P</span>
        <div className="flex-1">
          <p className="text-[12.5px] font-medium">Backup reviewer requested: Priya</p>
          <p className="text-[11px] text-[var(--l-ink-3)]">Knows the billing code · 1 open review · Leo stays on the pull request</p>
        </div>
        <RiUser3Line className="size-4 text-[var(--l-ink-3)]" />
      </div>
      <div className={cx(card, "mt-3 p-4")}>
        <p className="mb-2.5 text-[11px] text-[var(--l-ink-3)]">Leo's working hours · Europe/Berlin</p>
        <div className="grid grid-cols-7 gap-1.5">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
            <div key={d} className="grid gap-1 text-center">
              <span className="text-[10px] text-[var(--l-ink-3)]">{d}</span>
              <span className={cx("h-7 rounded-md", i < 5 ? "bg-[#2f7bf5]/15 shadow-[inset_0_0_0_1px_rgb(47_123_245/0.2)]" : "bg-black/[0.03]")} />
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] text-[var(--l-ink-3)]">Weekends and time off don't count against a deadline.</p>
      </div>
    </div>
  );
}

const TREND = [2, 3, 3, 4, 3, 5, 4, 6, 5, 7, 6, 9];

function InsightsScene({ t }: { t: number }) {
  const w = 520;
  const h = 170;
  const max = 10;
  const pts = TREND.map((v, i) => [24 + (i * (w - 48)) / (TREND.length - 1), h - 20 - (v / max) * (h - 40)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const draw = Math.min(1, t / 0.5);
  const tip = t > 0.58;
  const last = pts[pts.length - 1]!;
  return (
    <div>
      <Heading title="Merged per week" sub="Last 12 weeks" />
      <div className="mb-4 grid grid-cols-3 gap-3">
        {[
          ["Time to first review", "4.2h", "−38%"],
          ["Merged this week", "9", "+3"],
          ["Waiting over a day", "1", "−4"],
        ].map(([l, v, d2]) => (
          <div key={l} className={cx(card, "p-3.5")}>
            <p className="text-[11px] text-[var(--l-ink-3)]">{l}</p>
            <p className="mt-1 flex items-baseline gap-2 text-[20px] font-semibold">
              {v}
              <span className="rounded-full bg-[#16a34a]/10 px-1.5 text-[10.5px] font-medium text-[#16a34a]">{d2}</span>
            </p>
          </div>
        ))}
      </div>
      <div className={cx(card, "relative p-3")}>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="24" x2={w - 24} y1={20 + f * (h - 40)} y2={20 + f * (h - 40)} stroke="rgb(0 0 0 / 0.05)" />
          ))}
          <path d={`${d} L${last[0]},${h - 20} L24,${h - 20} Z`} fill="#2f7bf5" opacity={0.08 * draw} />
          <path d={d} fill="none" stroke="#2f7bf5" strokeWidth="2.5" strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - draw} />
          {tip && <circle cx={last[0]} cy={last[1]} r="5" fill="#2f7bf5" stroke="white" strokeWidth="2.5" />}
        </svg>
        <div
          className={cx("absolute top-3 right-6 w-[210px] rounded-lg bg-white p-2.5 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_10px_24px_-8px_rgb(15_23_42/0.2)] transition-all duration-300", tip ? "opacity-100" : "translate-y-1 opacity-0")}
        >
          <p className="text-[10.5px] text-[var(--l-ink-3)]">Week of Oct 5</p>
          <p className="text-[16px] font-semibold">9 merged</p>
          <p className="text-[11px] font-medium text-[#16a34a]">Highest in 12 weeks</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- frame ---------- */

const PATHS: Record<string, string> = { queue: "inbox", guide: "review/acme/api/482", post: "review/acme/api/482", deadline: "deadlines", insights: "insights" };

/** Minimal Chrome: one tab in the strip, then back/forward/reload and a left-aligned address bar. */
function Chrome({ path }: { path: string }) {
  return (
    <div className="shrink-0 bg-[#eef0f3]">
      <div className="flex h-9 items-end gap-2 px-3">
        <div className="mb-[13px] flex gap-[7px] pr-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-[10px] rounded-full bg-[#d5d8dd]" />
          ))}
        </div>
        <div className="relative flex h-[29px] w-[210px] items-center gap-2 rounded-t-[9px] bg-white px-3 text-[11.5px] text-[var(--l-ink)]">
          <AppIcon className="size-3.5" />
          <span className="truncate">Docks</span>
          <span className="ml-auto text-[13px] leading-none text-[var(--l-ink-3)]">×</span>
          {/* Chrome's flared tab corners */}
          <span className="absolute bottom-0 -left-2 size-2 bg-[radial-gradient(circle_at_0_0,transparent_8px,white_8.5px)]" />
          <span className="absolute -right-2 bottom-0 size-2 bg-[radial-gradient(circle_at_100%_0,transparent_8px,white_8.5px)]" />
        </div>
        <span className="mb-[9px] text-[15px] leading-none text-[var(--l-ink-3)]">+</span>
      </div>
      <div className="flex h-10 items-center gap-1 bg-white px-2.5 shadow-[0_1px_0_rgb(0_0_0/0.06)]">
        {["M10 4 6 8l4 4", "M6 4l4 4-4 4"].map((d, i) => (
          <svg key={d} viewBox="0 0 16 16" className={cx("size-7 p-1.5", i ? "text-[#c4c7cc]" : "text-[var(--l-ink-3)]")} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d={d} />
          </svg>
        ))}
        <svg viewBox="0 0 16 16" className="size-7 p-1.5 text-[var(--l-ink-3)]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M12.5 8A4.5 4.5 0 1 1 11 4.6M12.5 3v2.5H10" />
        </svg>
        <div className="ml-1 flex h-7 flex-1 items-center gap-2 rounded-full bg-[#f1f3f4] px-3 text-[11.5px]">
          <svg viewBox="0 0 16 16" className="size-3 text-[var(--l-ink-3)]" fill="currentColor">
            <path d="M5 7V5.5a3 3 0 0 1 6 0V7h.5A1.5 1.5 0 0 1 13 8.5v4A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5.5a1.5 1.5 0 0 0-3 0V7Z" />
          </svg>
          <span className="text-[var(--l-ink)]">docks.devzshrc.in</span>
          <span key={path} className="-ml-2 animate-[demo-in_300ms_ease-out] text-[var(--l-ink-3)]">/{path}</span>
        </div>
        <span className="ml-1 grid size-6 place-items-center rounded-full bg-[#dbeafe] text-[10px] font-semibold text-[#1d4ed8]">Y</span>
      </div>
    </div>
  );
}

/** Hero product demo: the headline scrolls up while the app screen levels out beneath it (ContainerScroll). */
export function ProductWindow({ title }: { title: ReactNode }) {
  const { scene, t, jump, still, pause } = useScenes();
  const { ref, scale } = useFit();
  // Only play while the demo is on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => pause(!e!.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, pause]);
  const active = SCENES[scene]!;
  const view: Record<string, ReactNode> = {
    queue: <QueueScene t={t} />,
    guide: <GuideScene t={t} />,
    post: <PostScene t={t} />,
    deadline: <DeadlineScene t={t} />,
    insights: <InsightsScene t={t} />,
  };
  const picker = (
    <div className="flex flex-col items-center gap-4">
        <div className="max-w-full overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div role="tablist" aria-label="Product tour" className="flex w-max gap-1 rounded-full bg-white/70 p-1 shadow-[0_0_0_1px_rgb(15_23_42/0.06),0_1px_2px_rgb(15_23_42/0.05),inset_0_1px_0_white] backdrop-blur">
            {SCENES.map((s, i) => {
              const on = i === scene;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => jump(i)}
                  className={cx(
                    "relative flex h-9 items-center gap-1.5 overflow-hidden rounded-full px-3.5 text-[13px] whitespace-nowrap transition-[color,background-color,box-shadow] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[var(--l-blue)]",
                    on ? "bg-white font-medium text-[var(--l-ink)] shadow-[0_0_0_1px_rgb(15_23_42/0.07),0_2px_6px_-2px_rgb(15_23_42/0.12)]" : "text-[var(--l-ink-2)] hover:text-[var(--l-ink)]",
                  )}
                >
                  {on && !still && (
                    <span aria-hidden className="absolute inset-y-0 left-0 bg-[var(--l-blue)]/[0.07]" style={{ width: `${t * 100}%` }} />
                  )}
                  <s.icon className={cx("relative size-3.5", on ? "text-[var(--l-blue)]" : "text-[var(--l-ink-3)]")} />
                  <span className="relative">{s.short}</span>
                </button>
              );
            })}
          </div>
        </div>
        <p key={active.id} className="max-w-[460px] animate-[demo-in_400ms_ease-out] text-center text-[15px] leading-[22px] text-pretty text-[var(--l-ink-2)]" aria-live="polite">
          <span className="font-medium text-[var(--l-ink)]">{active.title}.</span> {active.body}
        </p>
    </div>
  );
  return (
    <ContainerScroll titleComponent={title} footer={picker}>
      <div ref={ref} className="relative aspect-[16/10]" aria-hidden>
        <div className="absolute top-0 left-0 flex flex-col bg-[#fbfbfa]" style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
          <Chrome path={PATHS[active.id]!} />
          <div className="flex min-h-0 flex-1">
            <Sidebar active={active.id} />
            <div className="relative min-w-0 flex-1 p-7">
              <div key={active.id} className="h-full animate-[demo-in_450ms_cubic-bezier(0.25,1,0.5,1)]">
                {view[active.id]}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ContainerScroll>
  );
}
