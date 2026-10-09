"use client";

import { RiArrowRightSLine, RiCheckLine, RiFileTextLine, RiRocketLine, RiSearchLine, RiUserFollowLine } from "@remixicon/react";
import { AnimatePresence, motion } from "motion/react";

import { BrandIcon } from "@/components/brand-icons";
import { EASE, useStoryboard } from "@/components/marketing/motion";
import { cn } from "@/lib/utils";

import { Face, type Person } from "./parts";

export function BentoCard({
  title,
  body,
  children,
  className,
  tone = "light",
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
  className?: string;
  tone?: "light" | "dark" | "brand";
}) {
  return (
    <div
      className={cn(
        "group/bento relative flex flex-col overflow-hidden rounded-[28px] p-7 md:p-8",
        tone === "light" ? "bg-[#f4f4f5]" : tone === "brand" ? "bg-[#141210] text-white" : "bg-[#111113] text-white",
        className,
      )}
    >
      {tone === "brand" && <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(90% 70% at 100% 0%, rgb(3 105 161 / 0.4), transparent 60%)" }} />}
      <h3 className="relative text-[19px] leading-tight font-semibold tracking-[-0.025em] text-balance">{title}</h3>
      <p className={cn("relative mt-2 max-w-[22rem] text-[15px] leading-relaxed", tone === "light" ? "text-[#6b6b70]" : "text-white/65")}>{body}</p>
      {children && <div className="relative mt-8 flex flex-1 items-end">{children}</div>}
    </div>
  );
}

const DEADLINES: { n: number; title: string; who: Person; total: number; left: number[] }[] = [
  { n: 418, title: "Rate-limit login attempts", who: "mei", total: 8, left: [6, 5, 4, 4] },
  { n: 412, title: "Onboarding wizard v2", who: "raj", total: 8, left: [2, 1.5, 0.75, 0.5] },
  { n: 409, title: "Cache invoice totals", who: "leo", total: 8, left: [7, 7, 6.5, 6] },
];

/** Work-hour deadlines run down; the one about to slip asks a backup reviewer. */
export function DeadlineBoard() {
  const { ref, step } = useStoryboard([1500, 1500, 1500, 2600]);
  const backup = step === 3;
  return (
    <div ref={ref} aria-hidden className="w-full space-y-2">
      {DEADLINES.map((d, i) => {
        const left = d.left[step]!;
        const pct = (left / d.total) * 100;
        const risky = pct < 20;
        return (
          <div key={d.n} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.04)]">
            <Face who={d.who} className="size-7 text-[9px]" />
            <div className="grid min-w-0 flex-1 gap-1.5">
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="truncate font-medium tracking-[-0.01em]"><span className="text-[#a1a1aa]">#{d.n}</span> {d.title}</span>
                <motion.span key={left} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn("shrink-0 text-[12px] tabular-nums", risky ? "text-[#d97706]" : "text-[#6b6b70]")}>
                  {left < 1 ? `${Math.round(left * 60)}m` : `${left}h`} left
                </motion.span>
              </div>
              <span className="h-1.5 overflow-hidden rounded-full bg-[#ececee]">
                <motion.span className={cn("block h-full rounded-full", risky ? "bg-[#f59e0b]" : "bg-[#0369a1]")} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: EASE }} />
              </span>
            </div>
            <AnimatePresence>
              {i === 1 && backup && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9, width: 0 }}
                  animate={{ opacity: 1, scale: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="hidden shrink-0 items-center gap-1 overflow-hidden rounded-full bg-[#eef4ff] px-2.5 py-1 text-[11.5px] whitespace-nowrap text-[#1d4ed8] sm:flex"
                >
                  <RiUserFollowLine className="size-3" />
                  Backup asked
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

const RELEASE = ["Rate-limit login attempts", "Retry webhooks with backoff", "Audit log export to CSV", "Search index for docs"];

/** A release fills its readiness ring as each pull request is approved. */
export function ReleaseRing() {
  const { ref, step } = useStoryboard([1000, 900, 900, 900, 2400]);
  const ready = Math.min(step, RELEASE.length);
  const pct = ready / RELEASE.length;
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div ref={ref} aria-hidden className="flex w-full items-center gap-5">
      <span className="relative size-[88px] shrink-0">
        <svg viewBox="0 0 80 80" className="size-full -rotate-90">
          <circle cx="40" cy="40" r={r} stroke="#e4e4e7" strokeWidth="6" fill="none" />
          <motion.circle cx="40" cy="40" r={r} stroke={pct === 1 ? "#16a34a" : "#0369a1"} strokeWidth="6" strokeLinecap="round" fill="none" strokeDasharray={c} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 0.8, ease: EASE }} />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[19px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{ready}/4</span>
          <span className="mt-1 text-[10px] text-[#8b8b92]">ready</span>
        </span>
      </span>
      <ul className="grid min-w-0 flex-1 gap-1.5">
        {RELEASE.map((t, i) => (
          <li key={t} className="flex items-center gap-2 text-[12.5px]">
            <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full transition-colors duration-300", i < ready ? "bg-[#16a34a] text-white" : "border border-[#d4d4d8]")}>
              {i < ready && <RiCheckLine className="size-2.5" />}
            </span>
            <span className={cn("truncate transition-colors duration-300", i < ready ? "text-[#111113]" : "text-[#a1a1aa]")}>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const QUERIES = [
  { q: "418", hit: "api #418 · Rate-limit login attempts", icon: RiFileTextLine },
  { q: "release", hit: "Release 2.4 · 4 of 4 ready", icon: RiRocketLine },
  { q: "mei", hit: "Mei Chen · 2 open reviews", icon: RiUserFollowLine },
];

/** ⌘K: a query types itself and the top result lands. */
export function CommandK() {
  const { ref, step } = useStoryboard([2200, 2200, 2200]);
  const q = QUERIES[step % QUERIES.length]!;
  return (
    <div ref={ref} aria-hidden className="w-full">
      <div className="overflow-hidden rounded-2xl bg-white/[0.1] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14),0_20px_40px_-20px_rgb(0_0_0/0.5)] backdrop-blur">
        <div className="flex items-center gap-2 border-b border-white/[0.08] px-3.5 py-3 text-[13px]">
          <RiSearchLine className="size-3.5 text-white/40" />
          <AnimatePresence mode="wait">
            <motion.span key={q.q} className="flex">
              {q.q.split("").map((ch, i) => (
                <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 * i }}>
                  {ch}
                </motion.span>
              ))}
              <span className="ml-px w-px animate-pulse bg-white/70" />
            </motion.span>
          </AnimatePresence>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={q.hit} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.12 * q.q.length + 0.1, duration: 0.4, ease: EASE }} className="flex items-center gap-2 px-2 py-2">
            <span className="flex w-full items-center gap-2 rounded-lg bg-white/[0.14] px-2.5 py-2 text-[12.5px]">
              <q.icon className="size-3.5 text-white/50" />
              <span className="truncate">{q.hit}</span>
              <RiArrowRightSLine className="ml-auto size-3.5 text-white/40" />
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

const BARS = [62, 48, 55, 40, 34, 28, 22];

/** Insights: hours to first review, falling week over week. */
export function InsightBars() {
  return (
    <div aria-hidden className="w-full">
      <div className="flex h-[120px] items-end gap-2">
        {BARS.map((h, i) => (
          <motion.span
            key={i}
            className={cn("flex-1 rounded-t-[6px]", i === BARS.length - 1 ? "bg-[#0369a1]" : "bg-[#0369a1]/20")}
            initial={{ height: 0 }}
            whileInView={{ height: `${h + 30}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, delay: 0.08 * i, ease: EASE }}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between text-[11px] text-[#8b8b92]">
        <span>7 weeks ago</span>
        <span>This week</span>
      </div>
    </div>
  );
}

/** The three agents a pull request can be handed to. */
export function AgentStack() {
  return (
    <div aria-hidden className="flex w-full flex-col gap-2">
      {([["claude", "Claude Code", "#d97757"], ["codex", "Codex", "#111113"], ["cursor", "Cursor", "#111113"]] as const).map(([b, name, color], i) => (
        <motion.span
          key={b}
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 * i, ease: EASE }}
          className="flex items-center gap-3 rounded-2xl bg-white p-2.5 pr-3 text-[13px] font-medium shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.04)]"
        >
          <span className="flex size-7 items-center justify-center rounded-[9px] bg-[#f4f4f5]" style={{ color }}>
            <BrandIcon brand={b} className="size-4" />
          </span>
          {name}
          <span className="ml-auto text-[11.5px] font-normal text-[#8b8b92]">Fix the review notes</span>
        </motion.span>
      ))}
    </div>
  );
}
