"use client";

import {
  RiBarChartBoxLine,
  RiBugLine,
  RiCalendarScheduleLine,
  RiCheckLine,
  RiCloseLine,
  RiGitPullRequestLine,
  RiInboxLine,
  RiNotification3Line,
  RiRocketLine,
  RiSearchLine,
  RiTeamLine,
  RiTimeLine,
  RiAddLine,
  RiArrowDownSLine,
  RiCheckboxCircleFill,
  RiErrorWarningFill,
  RiLoader4Line,
} from "@remixicon/react";
import { AnimatePresence, motion } from "motion/react";

import { AppIcon } from "@/components/app-icon";
import { EASE, useStoryboard } from "@/components/marketing/motion";
import { cn } from "@/lib/utils";

import { CARD, CONTROL, Count, Face, PEOPLE, PRIMARY, Segments, Spark, Tag, TrafficLights, type Person, type Tone } from "./parts";

type Row = {
  n: number;
  title: string;
  repo: string;
  labels: { label: string; tone: Tone }[];
  who: Person;
  size: string;
  review: number;
  trend: number[];
  waiting: string;
  ci: "pass" | "fail" | "run";
};

const ROWS: Row[] = [
  { n: 418, title: "Rate-limit login attempts", repo: "api", labels: [{ label: "Security", tone: "red" }, { label: "Auth", tone: "blue" }], who: "dana", size: "M", review: 50, trend: [2, 4, 3, 6, 5, 8, 7], waiting: "2d", ci: "pass" },
  { n: 412, title: "Onboarding wizard v2", repo: "web", labels: [{ label: "Feature", tone: "purple" }, { label: "UI", tone: "teal" }], who: "raj", size: "L", review: 30, trend: [5, 3, 4, 2, 4, 3, 5], waiting: "1d", ci: "run" },
  { n: 415, title: "Bump Next.js to 15.5", repo: "web", labels: [{ label: "Deps", tone: "neutral" }], who: "bot", size: "S", review: 0, trend: [1, 1, 2, 1, 2, 1, 1], waiting: "3d", ci: "fail" },
  { n: 409, title: "Cache invoice totals", repo: "billing", labels: [{ label: "Perf", tone: "amber" }], who: "mei", size: "S", review: 80, trend: [3, 5, 6, 6, 7, 8, 9], waiting: "6h", ci: "pass" },
  { n: 407, title: "Search index for docs", repo: "docs", labels: [{ label: "Docs", tone: "green" }, { label: "Search", tone: "blue" }], who: "leo", size: "M", review: 100, trend: [2, 3, 5, 4, 6, 7, 9], waiting: "4h", ci: "pass" },
  { n: 404, title: "Retry webhooks with backoff", repo: "api", labels: [{ label: "Reliability", tone: "orange" }], who: "sam", size: "M", review: 65, trend: [4, 2, 3, 5, 4, 6, 6], waiting: "9h", ci: "pass" },
  { n: 401, title: "Audit log export to CSV", repo: "api", labels: [{ label: "Compliance", tone: "purple" }], who: "ivy", size: "S", review: 90, trend: [1, 2, 4, 5, 5, 7, 8], waiting: "1h", ci: "pass" },
];

const ORDER = [
  { title: "Rate limiter", why: "The new idea. Start here.", files: "src/rate-limit.ts" },
  { title: "Login flow", why: "Where the limiter is wired in.", files: "auth/login.ts · session.ts" },
  { title: "Tests and tooling", why: "Proof it works. Check last.", files: "rate-limit.test.ts" },
];

// 0 rows in · 1 cursor travels · 2 row picked · 3 sheet + step 1 · 4 step 2 · 5 step 3 · 6 approved · 7 sheet closes
const TIMELINE = [1500, 1100, 700, 1300, 1100, 1100, 1700, 1300];

const CURSOR = [
  { left: "78%", top: "92%" },
  { left: "34%", top: "47.5%" },
  { left: "34%", top: "47.5%" },
  { left: "88%", top: "86%" },
  { left: "88%", top: "86%" },
  { left: "88%", top: "86%" },
  { left: "88%", top: "86%" },
  { left: "60%", top: "75%" },
];

function CiIcon({ ci }: { ci: Row["ci"] }) {
  if (ci === "pass") return <RiCheckboxCircleFill className="size-3.5 text-[#22c55e]" aria-label="Checks passed" />;
  if (ci === "fail") return <RiErrorWarningFill className="size-3.5 text-[#f97373]" aria-label="Checks failed" />;
  return <RiLoader4Line className="size-3.5 animate-spin text-[#fbbf24] [animation-duration:2s]" aria-label="Checks running" />;
}

const NAV = [
  { items: [{ icon: RiInboxLine, label: "Inbox", count: 3 }, { icon: RiGitPullRequestLine, label: "Reviews", count: 12, active: true }, { icon: RiBugLine, label: "Issues", count: 4 }] },
  { title: "Planning", items: [{ icon: RiCalendarScheduleLine, label: "Deadlines" }, { icon: RiRocketLine, label: "Releases" }] },
  { title: "Team", items: [{ icon: RiBarChartBoxLine, label: "Insights" }, { icon: RiTeamLine, label: "People" }] },
];

/** The hero: the Reviews screen, playing through a guided review of one pull request. */
export function AppWindow({ className }: { className?: string }) {
  const { ref, step, reduce } = useStoryboard(TIMELINE);
  const picked = step >= 2 && step <= 7;
  const sheetOpen = step >= 3 && step <= 6;
  const done = step >= 6;
  const doneSteps = step >= 6 ? 3 : step >= 5 ? 2 : step >= 4 ? 1 : 0;

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Docks Reviews screen: a table of pull requests with labels, authors, review progress and checks. One pull request opens into a guided review with three steps."
      className={cn("relative overflow-hidden rounded-[14px] bg-[#161616] text-[#f9fbff] [font-feature-settings:'ss01']", className)}
    >
      <div className="flex h-9 items-center gap-3 border-b border-[#232323] bg-[#1a1a1a] px-3.5">
        <TrafficLights />
        <span className="mx-auto flex items-center gap-1.5 rounded-md bg-[#232323] px-3 py-1 font-mono text-[10.5px] text-[#8a8a8a]">
          docks.app/review
        </span>
        <span className="w-[42px]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[208px_1fr]">
        <aside aria-hidden className="hidden flex-col border-r border-[#232323] bg-[#171717] lg:flex">
          <div className="flex items-center gap-2 border-b border-[#232323] bg-[#1b1b1b] p-3">
            <AppIcon className="size-7" />
            <div className="grid gap-1 leading-none">
              <span className="text-[13px] font-medium">Acme</span>
              <span className="text-[11px] text-[#676767]">Code review workspace</span>
            </div>
          </div>
          {NAV.map((g, gi) => (
            <div key={gi} className={cn("flex flex-col gap-1 p-2.5", gi < NAV.length - 1 && "border-b border-[#232323]")}>
              {g.title && <span className="px-0.5 text-[10px] font-medium tracking-[0.08em] text-[#4a4a4a] uppercase">{g.title}</span>}
              {g.items.map((it) => (
                <span
                  key={it.label}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-[#8a8a8a]",
                    "active" in it && it.active && cn("h-[30px] bg-[#2a2a2a] font-medium text-[#f9fbff]", CONTROL),
                  )}
                >
                  <it.icon className={cn("size-3.5", "active" in it && it.active ? "text-[#d0d4dd]" : "text-[#676767]")} />
                  <span className="flex-1">{it.label}</span>
                  {"count" in it && <Count>{it.count}</Count>}
                </span>
              ))}
            </div>
          ))}
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#232323] bg-[#1b1b1b] p-3">
            <div className="grid gap-1 leading-none">
              <span className="text-[12.5px] font-medium">Team plan</span>
              <span className="text-[10.5px] text-[#676767]">14 people</span>
            </div>
            <span className={cn("rounded-full bg-[#2a2a2a] px-2.5 py-1.5 text-[11px] leading-none", CONTROL)}>Billing</span>
          </div>
        </aside>

        <div className="relative min-w-0">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-medium">Reviews</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#363636] bg-[#2a2a2a] py-[3px] pr-[6px] pl-[4px] text-[10.5px] leading-none">
                <span className="size-1.5 rounded-full bg-[#16c89e]" />
                Synced
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn("flex size-[26px] items-center justify-center rounded-full bg-[#1e1e1e]", CONTROL)}><RiSearchLine className="size-3" /></span>
              <span className={cn("relative flex size-[26px] items-center justify-center rounded-full bg-[#1e1e1e]", CONTROL)}>
                <RiNotification3Line className="size-3" />
                <span className="absolute top-[6px] right-[7px] size-[4px] rounded-full bg-[#f97373]" />
              </span>
              <span className={cn("hidden items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] leading-none font-medium sm:inline-flex", PRIMARY)}>
                <RiAddLine className="size-3" />
                New issue
              </span>
              <span className={cn("flex items-center gap-1 rounded-full bg-[#1e1e1e] py-1 pr-2 pl-1 text-[11px] leading-none", CONTROL)}>
                <Face who="mei" />
                Mei
              </span>
            </div>
          </div>

          <div className="flex gap-4 border-b border-[#232323] px-4 text-[11.5px]">
            {["Waiting on me", "All open", "Approved", "Drafts"].map((t, i) => (
              <span key={t} className={cn("-mb-px border-b py-2.5", i === 0 ? "border-[#f9fbff] font-medium text-[#f9fbff]" : "border-transparent text-[#676767]")}>
                {t}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="flex flex-wrap gap-1.5">
              {[["Sort by", "Waiting longest"], ["Repository", "All"], ["Author", "Anyone"]].map(([k, v], i) => (
                <span key={k} className={cn("items-center rounded-full bg-[#1e1e1e] text-[11px] leading-none", CONTROL, i > 1 ? "hidden md:inline-flex" : "inline-flex")}>
                  <span className="border-r border-[#393939] py-1.5 pr-2 pl-2.5 text-[#676767]">{k}</span>
                  <span className="flex items-center gap-1 py-1.5 pr-2 pl-2">
                    {v}
                    <RiArrowDownSLine className="size-3 text-[#8a8a8a]" />
                  </span>
                </span>
              ))}
            </div>
            <span className="text-[11px] text-[#676767]">7 open · 2 need you</span>
          </div>

          <div className="border-t border-[#232323]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,2.3fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)] border-b border-[#232323] px-4 py-2.5 text-[11px] text-[#676767] md:grid-cols-[minmax(0,2.3fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]">
              <span className="flex items-center gap-3"><span className="size-3 rounded-[3px] border border-[#393939]" />Pull request</span>
              <span className="hidden sm:block">Labels</span>
              <span className="hidden sm:block">Author</span>
              <span className="hidden md:block">Review progress</span>
              <span className="hidden md:block">Activity</span>
              <span className="text-right">Waiting</span>
            </div>
            {ROWS.map((r, i) => {
              const isPicked = i === 0 && picked;
              const approved = i === 0 && done;
              return (
                <motion.div
                  key={r.n}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={step === 0 && !reduce ? { opacity: [0, 1], y: [8, 0] } : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: step === 0 ? 0.08 * i : 0, ease: EASE }}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,2.3fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)] border-b border-[#232323] px-4 py-[9px] text-[12.5px] transition-colors duration-300 md:grid-cols-[minmax(0,2.3fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]",
                    isPicked && "bg-[#1b1c1e]",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={cn("flex size-3 shrink-0 items-center justify-center rounded-[3px] border transition-colors", isPicked ? "border-[#e5a50a] bg-[#f5b81f]" : "border-[#393939]")}>
                      {isPicked && <RiCheckLine className="size-2.5 text-[#161616]" />}
                    </span>
                    <span className="truncate"><span className="text-[#676767]">#{r.n}</span> {r.title}</span>
                  </span>
                  <span className="hidden min-w-0 items-center gap-[3px] overflow-hidden sm:flex">
                    {r.labels.map((l) => <Tag key={l.label} tone={l.tone}>{l.label}</Tag>)}
                  </span>
                  <span className="hidden min-w-0 items-center gap-1.5 truncate sm:flex">
                    <Face who={r.who} />
                    <span className="truncate">{PEOPLE[r.who].name}</span>
                  </span>
                  <span className="hidden items-center gap-2 md:flex">
                    <Segments percent={approved ? 100 : r.review} className="w-[70px]" />
                    <span className="w-[3.5ch] text-right text-[11.5px] tabular-nums">{approved ? 100 : r.review}%</span>
                  </span>
                  <span className="hidden md:block"><Spark values={r.trend} /></span>
                  <span className="flex items-center justify-end gap-1.5 text-[12px] tabular-nums">
                    {approved ? <Tag tone="green">Approved</Tag> : <><RiTimeLine className="size-3 text-[#8a8a8a]" />{r.waiting}<CiIcon ci={r.ci} /></>}
                  </span>
                </motion.div>
              );
            })}
            <div className="grid grid-cols-2 text-[11px] text-[#676767] md:grid-cols-3">
              <span className="px-4 py-2.5"><span className="text-[#cfcfcf]">7</span> pull requests in view</span>
              <span className="border-l border-[#232323] px-4 py-2.5">2 waiting over 24h</span>
              <span className="hidden border-l border-[#232323] px-4 py-2.5 md:block">Median first review 3h</span>
            </div>
          </div>

          <AnimatePresence>
            {sheetOpen && (
              <motion.div
                key="sheet"
                initial={{ x: "105%" }}
                animate={{ x: 0 }}
                exit={{ x: "105%" }}
                transition={{ duration: 0.6, ease: EASE }}
                className="absolute inset-y-0 right-0 z-10 flex w-[min(370px,92%)] flex-col border-l border-[#393939] bg-[#161616] shadow-[-24px_0_48px_rgb(0_0_0/0.45)]"
              >
                <div className="flex items-center justify-between border-b border-[#393939] px-4 py-3">
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium"><RiGitPullRequestLine className="size-3.5 text-[#d0d4dd]" />Guided review</span>
                  <RiCloseLine className="size-3.5 text-[#8a8a8a]" />
                </div>
                <div className="flex items-start gap-3 border-b border-[#393939] p-4">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#2a2a2a]", CONTROL)}><Face who="dana" className="size-6 text-[9px]" /></span>
                  <div className="grid min-w-0 gap-2">
                    <span className="truncate text-[13.5px] font-semibold">Rate-limit login attempts</span>
                    <span className="flex gap-[3px]"><Tag tone="red">Security</Tag><Tag tone="blue">Auth</Tag><Tag>+158 −6</Tag></span>
                  </div>
                </div>
                <div className="flex flex-col gap-3 border-b border-[#393939] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] tracking-[0.08em] text-[#a4a4a4] uppercase">Review order</span>
                    <span className="text-[11px] text-[#8a8a8a] tabular-nums">{doneSteps}/3</span>
                  </div>
                  <span className="h-1 overflow-hidden rounded-full bg-[#2a2a2a]">
                    <motion.span className="block h-full rounded-full bg-[#22c55e]" animate={{ width: `${(doneSteps / 3) * 100}%` }} transition={{ duration: 0.6, ease: EASE }} />
                  </span>
                  {ORDER.map((o, i) => {
                    const on = i < doneSteps;
                    const current = i === doneSteps && !done;
                    return (
                      <div key={o.title} className={cn("flex gap-3 rounded-lg bg-[#1b1c1e] p-3 transition-[opacity,background-color] duration-500", CARD, !on && !current && "opacity-55")}>
                        <span className={cn("mt-px flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] transition-colors duration-300", on ? "bg-[#22c55e] text-[#0d2a18]" : current ? "bg-[#f9fbff] text-[#161616]" : "border border-[#454545] text-[#8a8a8a]")}>
                          {on ? <RiCheckLine className="size-2.5" /> : i + 1}
                        </span>
                        <div className="grid min-w-0 gap-1">
                          <span className="text-[12.5px] leading-none font-medium">{o.title}</span>
                          <span className="text-[11.5px] leading-snug text-[#a4a4a4]">{o.why}</span>
                          <span className="truncate font-mono text-[10.5px] text-[#676767]">{o.files}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#393939] px-4 py-3">
                  <span className="text-[11px] text-[#8a8a8a]">Due in 3 work hours</span>
                  <motion.span
                    animate={done ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                    transition={{ duration: 0.5, ease: EASE }}
                    className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 text-[11.5px] leading-none font-medium", done ? "bg-[#1f3a2d] text-[#b1ebc5] shadow-[0_0_0_1px_#275137]" : PRIMARY)}
                  >
                    {done ? <><RiCheckLine className="size-3" />Approved</> : "Approve"}
                  </motion.span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {!reduce && (
        <motion.svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute z-20 size-5 drop-shadow-[0_2px_4px_rgb(0_0_0/0.5)]"
          initial={false}
          animate={{ left: CURSOR[step]!.left, top: CURSOR[step]!.top, scale: step === 2 || step === 6 ? 0.85 : 1 }}
          transition={{ duration: 0.9, ease: EASE }}
        >
          <path d="M5 3l13 8-6 1.5L9 19z" fill="white" stroke="#161616" strokeWidth="1.4" strokeLinejoin="round" />
        </motion.svg>
      )}
    </div>
  );
}
