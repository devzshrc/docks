"use client";

import { RiChat3Line, RiCheckLine } from "@remixicon/react";
import { AnimatePresence, motion } from "motion/react";

import { EASE, useStoryboard } from "@/components/marketing/motion";
import { cn } from "@/lib/utils";

import { CARD, CONTROL, Face, TrafficLights } from "./parts";

const GITHUB_ORDER = ["package.json", "pnpm-lock.yaml", "src/auth/login.ts", "src/auth/session.ts", "src/rate-limit.ts", "tests/rate-limit.test.ts"];

const STEPS = [
  {
    title: "Rate limiter",
    why: "The new idea. Start here.",
    file: "src/rate-limit.ts",
    lines: [
      { n: 1, t: "export function rateLimit(key: string) {", k: "add" },
      { n: 2, t: "  const hits = store.incr(key, WINDOW)", k: "add" },
      { n: 3, t: "  if (hits > MAX_ATTEMPTS) {", k: "add" },
      { n: 4, t: "    throw new TooManyRequests(retryAfter(key))", k: "add" },
      { n: 5, t: "  }", k: "add" },
      { n: 6, t: "}", k: "add" },
    ],
  },
  {
    title: "Login flow",
    why: "Where the limiter is wired in.",
    file: "src/auth/login.ts",
    lines: [
      { n: 41, t: "export async function login(input: LoginInput) {", k: "ctx" },
      { n: 42, t: "  const { email, password } = parse(input)", k: "ctx" },
      { n: 43, t: "  const user = await db.findUser(email)", k: "del" },
      { n: 43, t: "  rateLimit(`login:${email}`)", k: "add" },
      { n: 44, t: "  const user = await db.findUser(email)", k: "add" },
      { n: 45, t: "  return verify(user, password)", k: "ctx" },
    ],
  },
  {
    title: "Tests and tooling",
    why: "Proof it works. Check last.",
    file: "tests/rate-limit.test.ts",
    lines: [
      { n: 1, t: "test(\"blocks the sixth attempt\", () => {", k: "add" },
      { n: 2, t: "  for (let i = 0; i < 5; i++) rateLimit(\"k\")", k: "add" },
      { n: 3, t: "  expect(() => rateLimit(\"k\"))", k: "add" },
      { n: 4, t: "    .toThrow(TooManyRequests)", k: "add" },
      { n: 5, t: "})", k: "add" },
    ],
  },
];

const TIMELINE = [2600, 2600, 2600, 1600];

/** Files in GitHub's order on the left; the order Docks asks you to read them on the right, with the diff for the current step. */
export function ReviewOrder() {
  const { ref, step } = useStoryboard(TIMELINE);
  const active = Math.min(step, 2);
  const finished = step === 3;
  const s = STEPS[active]!;

  return (
    <div ref={ref} role="img" aria-label="A pull request's files grouped into three steps: rate limiter, login flow, then tests. The diff for each step plays in turn." className="overflow-hidden rounded-[18px] bg-(--mk-bg) text-(--mk-fg) shadow-[0_0_0_1px_var(--mk-line),0_24px_48px_-24px_rgb(0_0_0/0.18)]">
      <div className="flex h-9 items-center gap-3 border-b border-(--mk-border) bg-(--mk-bar) px-3.5">
        <TrafficLights />
        <span className="ml-2 truncate text-[11.5px] text-(--mk-muted)">api #418 · Rate-limit login attempts</span>
      </div>
      <div className="grid md:grid-cols-[230px_1fr]">
        <div className="hidden flex-col gap-4 border-r border-(--mk-border) bg-(--mk-side) p-3.5 md:flex">
          <div className="grid gap-1.5">
            <span className="text-[10px] font-medium tracking-[0.08em] text-(--mk-faint) uppercase">GitHub order</span>
            {GITHUB_ORDER.map((f) => (
              <span key={f} className={cn("truncate font-mono text-[10.5px] transition-colors duration-500", f === s.file ? "text-(--mk-fg)" : "text-(--mk-faint)")}>
                {f}
              </span>
            ))}
          </div>
          <div className="h-px bg-(--mk-border)" />
          <div className="grid gap-1.5">
            <span className="text-[10px] font-medium tracking-[0.08em] text-(--mk-faint) uppercase">Docks order</span>
            {STEPS.map((st, i) => {
              const done = i < active || finished;
              const on = i === active && !finished;
              return (
                <span
                  key={st.title}
                  className={cn("relative flex items-start gap-2 rounded-lg p-2 transition-colors duration-500", on && cn("bg-(--mk-raise)", CONTROL))}
                >
                  <span className={cn("mt-px flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] transition-colors duration-300", done ? "bg-[#22c55e] text-[#0d2a18]" : on ? "bg-(--mk-fg) text-(--mk-bg)" : "border border-(--mk-faint2) text-(--mk-muted)")}>
                    {done ? <RiCheckLine className="size-2.5" /> : i + 1}
                  </span>
                  <span className="grid gap-0.5">
                    <span className="text-[12px] leading-tight font-medium">{st.title}</span>
                    <span className="text-[10.5px] leading-snug text-(--mk-muted)">{st.why}</span>
                  </span>
                </span>
              );
            })}
          </div>
        </div>
        <div className="relative min-w-0">
          <div className="flex items-center justify-between border-b border-(--mk-border) px-4 py-2.5">
            <AnimatePresence mode="wait">
              <motion.span key={s.file} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3, ease: EASE }} className="font-mono text-[11.5px] text-(--mk-chip)">
                {s.file}
              </motion.span>
            </AnimatePresence>
            <span className="text-[11px] text-(--mk-muted) tabular-nums">Step {active + 1} of 3</span>
          </div>
          <div className="h-[244px] py-2 font-mono text-[11.5px] leading-[24px]">
            <AnimatePresence mode="wait">
              <motion.div key={s.file} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {s.lines.map((l, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: 0.12 + i * 0.09, ease: EASE }}
                    className={cn("flex gap-3 px-4 whitespace-pre", l.k === "add" && "bg-[#22c55e]/[0.09]", l.k === "del" && "bg-[#f97373]/[0.1] text-(--mk-soft) line-through decoration-[#f97373]/40")}
                  >
                    <span className="w-6 shrink-0 text-right text-(--mk-faint) select-none">{l.n}</span>
                    <span className={cn("w-2 shrink-0", l.k === "add" ? "text-[#22c55e]" : l.k === "del" ? "text-[#f97373]" : "text-transparent")}>{l.k === "add" ? "+" : l.k === "del" ? "−" : " "}</span>
                    <span className="overflow-hidden text-ellipsis whitespace-pre">{l.t}</span>
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {active === 1 && !finished && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.5, delay: 0.9, ease: EASE }}
                className={cn("absolute right-4 bottom-4 flex max-w-[260px] items-start gap-2 rounded-xl bg-(--mk-card) p-3", CARD)}
              >
                <Face who="mei" className="size-5 text-[7.5px]" />
                <span className="grid gap-1">
                  <span className="flex items-center gap-1 text-[11px] text-(--mk-muted)"><RiChat3Line className="size-3" />Mei · line 43</span>
                  <span className="text-[12px] leading-snug">Limit before the lookup, so a locked account costs no query. Nice.</span>
                </span>
              </motion.div>
            )}
            {finished && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="absolute inset-0 flex items-center justify-center bg-(--mk-bg)/80 backdrop-blur-[2px]"
              >
                <span className="flex items-center gap-2 rounded-full bg-(--tag-green-bg) px-4 py-2 text-[13px] font-medium text-(--tag-green-text) shadow-[0_0_0_1px_var(--tag-green-border)]">
                  <RiCheckLine className="size-4" />
                  Reviewed in order · 3 of 3
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
