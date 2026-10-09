"use client";

import {
  RiCheckLine,
  RiGitMergeLine,
  RiGitPullRequestLine,
  RiLoader4Line,
  RiMoonClearLine,
  RiSlackFill,
  RiTimerLine,
} from "@remixicon/react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { EASE, useStoryboard } from "@/components/marketing/motion";
import { cx } from "@/utils/cx";

/**
 * Tracks the pointer over the hero. Writes `--mx`/`--my` for the spotlight and returns springy
 * -1..1 values for parallax, so nothing re-renders on move.
 */
export function useHeroPointer() {
  const ref = useRef<HTMLElement>(null);
  const x = useSpring(0, { stiffness: 50, damping: 18 });
  const y = useSpring(0, { stiffness: 50, damping: 18 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const move = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      el.style.setProperty("--mx", `${px}px`);
      el.style.setProperty("--my", `${py}px`);
      x.set((px / rect.width) * 2 - 1);
      y.set((event.clientY / window.innerHeight) * 2 - 1);
    };
    el.addEventListener("pointermove", move);
    return () => el.removeEventListener("pointermove", move);
  }, [x, y]);
  return { ref, x, y };
}

/** Fades and lifts hero content in on load, one beat after the last. */
export function Rise({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 1, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

const grid = (alpha: number) =>
  `linear-gradient(to right, rgb(255 255 255 / ${alpha}) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / ${alpha}) 1px, transparent 1px)`;

/** Night grid, breathing glow and a spotlight that follows the pointer. */
export function HeroBackdrop() {
  const reduce = useReducedMotion();
  const cell = { backgroundSize: "64px 64px", backgroundPosition: "calc(50% - 32px) 0" };
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute top-[-38%] left-1/2 h-[85%] w-[95%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(3_105_161/0.38),rgb(3_105_161/0.08)_58%,transparent)] blur-2xl"
        animate={reduce ? undefined : { opacity: [0.65, 1, 0.65], scale: [1, 1.06, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="absolute inset-0"
        style={{
          ...cell,
          backgroundImage: grid(0.04),
          maskImage: "radial-gradient(75% 65% at 50% 30%, black, transparent 80%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-700 group-hover/hero:opacity-100"
        style={{
          ...cell,
          backgroundImage: grid(0.13),
          maskImage: "radial-gradient(240px circle at var(--mx, 50%) var(--my, 30%), black, transparent 75%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-700 group-hover/hero:opacity-100"
        style={{ background: "radial-gradient(480px circle at var(--mx, 50%) var(--my, 30%), rgb(56 189 248 / 0.07), transparent 70%)" }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/30 to-transparent" />
    </div>
  );
}

const WORDS = ["wait", "chase", "pings", "jugaad"];

/** The last word of the headline: everything Docks takes out of code review, in turn. */
export function RotatingWord({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [widths, setWidths] = useState<number[]>([]);
  const measures = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const measure = () => setWidths(measures.current.map((el) => el?.offsetWidth ?? 0));
    measure();
    void document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    // Phones keep the line still: a changing word would rewrap the headline.
    if (reduce || !window.matchMedia("(min-width: 768px)").matches) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % WORDS.length), index === 0 ? 4200 : 2000);
    return () => clearTimeout(timer);
  }, [index, reduce]);

  return (
    <motion.span
      className="relative inline-flex justify-start whitespace-nowrap"
      animate={widths[index] ? { width: widths[index] } : undefined}
      transition={{ duration: 0.55, ease: EASE }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={WORDS[index]}
          className={cx("inline-block bg-gradient-to-b from-white from-40% to-sky-200 bg-clip-text pe-[0.08em] pb-[0.08em] text-transparent", className)}
          initial={{ y: "40%", opacity: 0, filter: "blur(10px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "-40%", opacity: 0, filter: "blur(10px)" }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          {WORDS[index]}.
        </motion.span>
      </AnimatePresence>
      {WORDS.map((word, i) => (
        <span
          key={word}
          ref={(el) => {
            measures.current[i] = el;
          }}
          className={cx("invisible absolute top-0 left-0 pe-[0.08em]", className)}
        >
          {word}.
        </span>
      ))}
    </motion.span>
  );
}

function FloatCard({
  children,
  className,
  depth,
  rotate,
  delay,
  pointer,
}: {
  children: ReactNode;
  className: string;
  depth: number;
  rotate: number;
  delay: number;
  pointer: { x: MotionValue<number>; y: MotionValue<number> };
}) {
  const reduce = useReducedMotion();
  const x = useTransform(pointer.x, (v) => v * depth);
  const y = useTransform(pointer.y, (v) => v * depth);
  return (
    <motion.div
      style={reduce ? undefined : { x, y }}
      className={cx("absolute z-10 hidden min-[1440px]:block", className)}
      initial={reduce ? false : { opacity: 0, scale: 0.92, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 1.1, delay, ease: EASE }}
    >
      <motion.div
        animate={reduce ? undefined : { y: [0, -7, 0] }}
        transition={{ duration: 5 + depth / 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.div
          style={{ rotate }}
          whileHover={{ rotate: 0, scale: 1.04 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="w-[236px] rounded-2xl border border-white/10 bg-[#0a0b0d]/85 p-3.5 text-start shadow-[0_24px_60px_-24px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-md transition-colors duration-300 hover:border-sky-300/30"
        >
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function CardLabel({ icon, children, aside }: { icon: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/45 [&_svg]:size-3.5">
      {icon}
      <span className="flex-1">{children}</span>
      {aside && <span className="text-white/35 tabular-nums">{aside}</span>}
    </div>
  );
}

function Tick({ value }: { value: string | number }) {
  return (
    <span className="relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Work-hour deadline: counts down, then pauses for the night. */
function DeadlineCard() {
  const { ref, step } = useStoryboard([1100, 1100, 1100, 2800]);
  const paused = step === 3;
  const minutes = 14 - Math.min(step, 2);
  return (
    <div ref={ref}>
      <CardLabel icon={<RiTimerLine />} aside="#418">
        Review deadline
      </CardLabel>
      <p className="mt-2 text-[13px] font-medium text-white/90">Rate-limit login attempts</p>
      <div className="mt-3 flex items-end justify-between">
        <span className="text-[22px] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap text-white tabular-nums">
          2h <Tick value={minutes} />m
        </span>
        <AnimatePresence mode="wait" initial={false}>
          {paused ? (
            <motion.span
              key="paused"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-1 rounded-full bg-amber-300/10 px-2 py-0.5 text-[10.5px] whitespace-nowrap font-medium text-amber-200 ring-1 ring-amber-200/20 [&_svg]:size-3"
            >
              <RiMoonClearLine /> Paused overnight
            </motion.span>
          ) : (
            <motion.span
              key="running"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10.5px] whitespace-nowrap font-medium text-emerald-300 ring-1 ring-emerald-300/20"
            >
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-300" />
              </span>
              Work hours
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div
          className={cx("h-full rounded-full", paused ? "bg-amber-200/60" : "bg-sky-400")}
          animate={{ width: `${(minutes / 24) * 100}%` }}
          transition={{ duration: 0.8, ease: EASE }}
        />
      </div>
    </div>
  );
}

/** A backup reviewer gets asked before the review slips. */
function NudgeCard() {
  const { ref, step } = useStoryboard([1300, 3000, 2800]);
  return (
    <div ref={ref}>
      <CardLabel icon={<RiSlackFill />}>#eng-reviews</CardLabel>
      <div className="mt-2.5 flex gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#0369a1] text-[11px] font-semibold text-white">D</span>
        <div className="min-h-[52px] flex-1">
          <p className="text-[12px] font-semibold text-white">
            Docks <span className="ms-1 rounded bg-white/10 px-1 py-px text-[9px] font-medium text-white/50 uppercase">App</span>
          </p>
          <AnimatePresence mode="wait" initial={false}>
            {step === 0 ? (
              <motion.span key="typing" exit={{ opacity: 0 }} className="mt-2 flex gap-1">
                {[0, 1, 2].map((dot) => (
                  <motion.span
                    key={dot}
                    className="size-1.5 rounded-full bg-white/40"
                    animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: dot * 0.15 }}
                  />
                ))}
              </motion.span>
            ) : (
              <motion.p
                key="message"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="mt-0.5 text-[12px] leading-snug text-white/70"
              >
                Ananya is out today. <span className="text-sky-300">@Kabir</span>, you&apos;re up for #412.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
      <motion.div
        className="mt-2.5 ms-[38px] flex items-center gap-1.5"
        animate={{ opacity: step === 2 ? 1 : 0, y: step === 2 ? 0 : 4 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <span className="rounded-full bg-sky-400/10 px-1.5 py-0.5 text-[10.5px] text-sky-200 ring-1 ring-sky-300/25">👀 1</span>
        <span className="text-[10.5px] text-white/45">Kabir: on it</span>
      </motion.div>
    </div>
  );
}

const ORDER = ["The new limiter", "Wire it into login", "Tests that prove it"];

/** Guided review order, ticking itself off. */
function OrderCard() {
  const { ref, step } = useStoryboard([800, 800, 800, 2400]);
  return (
    <div ref={ref}>
      <CardLabel icon={<RiGitPullRequestLine />} aside={<Tick value={`${step}/3`} />}>
        Review order
      </CardLabel>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div className="h-full rounded-full bg-sky-400" animate={{ width: `${(step / 3) * 100}%` }} transition={{ duration: 0.5, ease: EASE }} />
      </div>
      <ol className="mt-3 grid gap-2">
        {ORDER.map((item, index) => {
          const done = index < step;
          return (
            <li key={item} className="flex items-center gap-2 text-[12px]">
              <span
                className={cx(
                  "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ring-1 transition-colors duration-300",
                  done ? "bg-sky-400 text-black ring-sky-400" : "text-white/50 ring-white/20",
                )}
              >
                {done ? (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
                    <RiCheckLine className="size-3" />
                  </motion.span>
                ) : (
                  index + 1
                )}
              </span>
              <span className={cx("transition-colors duration-300", done ? "text-white/40" : "text-white/80")}>{item}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const MERGE_STATES = [
  { key: "checks", label: "Checks running", tone: "bg-amber-300/10 text-amber-200 ring-amber-200/20", icon: <RiLoader4Line className="animate-spin" /> },
  { key: "approved", label: "Approved by 2", tone: "bg-emerald-400/10 text-emerald-300 ring-emerald-300/20", icon: <RiCheckLine /> },
  { key: "merged", label: "Merged", tone: "bg-violet-400/15 text-violet-200 ring-violet-300/25", icon: <RiGitMergeLine /> },
];

/** A pull request on its way to main. */
function MergeCard() {
  const { ref, step } = useStoryboard([1500, 1500, 3000]);
  const state = MERGE_STATES[step];
  return (
    <div ref={ref}>
      <CardLabel icon={<RiGitMergeLine />} aside="→ main">
        #412
      </CardLabel>
      <p className="mt-2 text-[13px] font-medium text-white/90">Onboarding wizard v2</p>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {["KB", "MR"].map((initials, index) => (
            <motion.span
              key={initials}
              className="flex size-6 items-center justify-center rounded-full bg-[#1b2530] text-[9px] font-semibold text-sky-200 ring-2 ring-[#0a0b0d]"
              animate={{ opacity: step >= 1 ? 1 : 0.35, scale: step >= 1 ? 1 : 0.9 }}
              transition={{ delay: index * 0.12, duration: 0.4, ease: EASE }}
            >
              {initials}
            </motion.span>
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={state.key}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3, ease: EASE }}
            className={cx("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 [&_svg]:size-3", state.tone)}
          >
            {state.icon}
            {state.label}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Four live glimpses of the product, floating in the hero side margins on wide screens. */
export function HeroCards({ pointer }: { pointer: { x: MotionValue<number>; y: MotionValue<number> } }) {
  return (
    <div aria-hidden="true" className="contents">
      <FloatCard pointer={pointer} depth={-10} rotate={-4} delay={0.7} className="-start-[250px] top-6 2xl:-start-[290px]">
        <DeadlineCard />
      </FloatCard>
      <FloatCard pointer={pointer} depth={-18} rotate={3} delay={0.95} className="-start-[240px] top-[268px] 2xl:-start-[270px]">
        <NudgeCard />
      </FloatCard>
      <FloatCard pointer={pointer} depth={14} rotate={4} delay={0.8} className="-end-[250px] top-2 2xl:-end-[280px]">
        <OrderCard />
      </FloatCard>
      <FloatCard pointer={pointer} depth={22} rotate={-3} delay={1.05} className="-end-[240px] top-[250px] 2xl:-end-[300px]">
        <MergeCard />
      </FloatCard>
    </div>
  );
}
