"use client";

import {
  RiArrowDownLine,
  RiArrowRightLine,
  RiCheckLine,
  RiGithubFill,
  RiGitBranchLine,
  RiHistoryLine,
  RiListCheck3,
  RiSlackFill,
  RiTaskLine,
  RiTimerLine,
  RiUserFollowLine,
  RiUserStarLine,
} from "@remixicon/react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Bricolage_Grotesque, Instrument_Serif, Kalam, Work_Sans } from "next/font/google";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";


import { BrandIcon } from "@/components/brand-icons";
import { CrowdStrip } from "@/components/landing/crowd-strip";
import { HeroBackdrop, HeroCards, Rise, RotatingWord, useHeroPointer } from "@/components/landing/hero-stage";
import { useGithubStart } from "@/components/landing/use-github-start";
import { Grain } from "@/components/marketing/backdrop";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { Faq } from "@/components/marketing/faq";
import { AppWindow } from "@/components/marketing/mock/app-window";
import { AgentStack, BentoCard, CommandK, DeadlineBoard, InsightBars, ReleaseRing } from "@/components/marketing/mock/bento";
import { FlowDiagram } from "@/components/marketing/mock/flow-diagram";
import { InboxStream } from "@/components/marketing/mock/inbox-stream";
import { ReviewOrder } from "@/components/marketing/mock/review-order";
import { DisplayHeading, EASE, Reveal } from "@/components/marketing/motion";
import { PlanTile } from "@/components/marketing/plan-tiles";
import { MarketingFrame, PillButton } from "@/components/marketing/site-chrome";
import { Button } from "@/components/ui/button";
import { Skiper39 } from "@/components/ui/skiper39";
import { useSession } from "@/lib/auth-client";
import { cx } from "@/utils/cx";

const heroFont = Work_Sans({ subsets: ["latin"], display: "swap" });
// The headline: a quirky grotesk, an italic serif for the word that changes, and a hand for the Hinglish asides.
const displayFont = Bricolage_Grotesque({ subsets: ["latin"], display: "swap" });
const serifFont = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", display: "swap" });
const handFont = Kalam({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });

const WORKS_WITH = [
  { icon: <RiGithubFill className="size-[22px]" />, label: "GitHub" },
  { icon: <RiSlackFill className="size-[22px]" />, label: "Slack" },
  { icon: <RiTaskLine className="size-[22px]" />, label: "Linear" },
  { icon: <BrandIcon brand="claude" className="size-5" />, label: "Claude Code" },
  { icon: <BrandIcon brand="codex" className="size-5" />, label: "Codex" },
  { icon: <BrandIcon brand="cursor" className="size-5" />, label: "Cursor" },
];

export function Landing() {
  const { start, pending, notice } = useGithubStart();
  const { data } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (data?.user) router.replace("/review");
  }, [data, router]);

  const startButton = (tone: "brand" | "white" = "brand", size: "md" | "lg" = "lg") => (
    <PillButton tone={tone} size={size} onClick={() => void start()} disabled={pending} className="overflow-hidden">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 start-0 w-1/3 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover/pill:translate-x-[400%]"
      />
      <RiGithubFill />
      {pending ? "Connecting…" : "Start with GitHub"}
    </PillButton>
  );

  return (
    <MarketingFrame dark>
      <main>
        <Hero startButton={startButton()} notice={notice} />
        <WorksWith />
        <InboxSection />
        <OrderSection />
        <WorkflowSection />
        <BentoSection />
        <PricingTeaser startButton={startButton("white", "md")} />
        <FaqSection />
        <ClosingCta startButton={startButton("white")} />
      </main>
    </MarketingFrame>
  );
}

function Hero({ startButton, notice }: { startButton: React.ReactNode; notice: string | null }) {
  const reduce = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: stage, offset: ["start end", "start 0.25"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 16, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 0.92, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 40, 0]);
  const pointer = useHeroPointer();

  return (
    <section ref={pointer.ref} className="group/hero relative isolate">
      <Skiper39 className={`${heroFont.className} bg-black text-white`} backdrop={<HeroBackdrop />} crowd={<CrowdStrip />}>
        <HeroCards pointer={pointer} />
        <Rise>
          <a
            href="#order"
            className="group/badge relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-white/15 bg-white/[0.04] py-1.5 ps-1.5 pe-3 text-caption-1-medium text-white/70 outline-none transition-colors hover:border-white/25 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 start-0 w-1/3 skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/15 to-transparent"
              initial={{ x: "-120%" }}
              animate={reduce ? undefined : { x: "420%" }}
              transition={{ duration: 1.6, delay: 1.4, repeat: Infinity, repeatDelay: 4.5, ease: "easeInOut" }}
            />
            <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[10.5px] font-semibold tracking-wide text-sky-300 uppercase">New</span>
            <RiGitBranchLine aria-hidden="true" className="size-4 shrink-0 text-hue-blue" />
            <span className="sm:hidden">Guided code review</span>
            <span className="hidden sm:inline">Guided review order for every pull request</span>
            <RiArrowRightLine aria-hidden="true" className="size-3.5 shrink-0 transition-transform duration-300 group-hover/badge:translate-x-0.5" />
          </a>
        </Rise>
        <Rise delay={0.1} className="relative">
          <div aria-hidden="true" className="pointer-events-none absolute -start-24 top-0 hidden -rotate-12 md:block">
            <motion.div
              animate={reduce ? undefined : { y: [0, -6, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="flex size-16 items-center justify-center rounded-3xl border border-white/15 bg-[#080808] text-white shadow-lg"
            >
              <RiGithubFill className="size-9" />
            </motion.div>
            <svg viewBox="0 0 44 28" fill="none" className="ms-12 mt-2 h-7 w-11 text-white/25">
              <motion.path
                d="M2 0V14Q2 26 14 26H44"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="3 5"
                animate={reduce ? undefined : { strokeDashoffset: [0, -16] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
              />
            </svg>
          </div>
          <h1 className={cx(displayFont.className, "text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance text-white md:text-[4.4rem]")}>
            <span className="sr-only">Code review, without the wait.</span>
            <span aria-hidden="true" className="block">Code review,</span>
            <span aria-hidden="true" className="block">
              without the <RotatingWord className={cx(serifFont.className, "text-[1.12em] font-normal tracking-[-0.01em]")} />
            </span>
          </h1>
          <div aria-hidden="true" className="pointer-events-none absolute -end-28 bottom-0 hidden rotate-12 md:block">
            <motion.div
              animate={reduce ? undefined : { y: [0, -6, 0] }}
              transition={{ duration: 5.6, delay: 0.8, repeat: Infinity, ease: "easeInOut" }}
              className="flex flex-col items-center gap-2"
            >
              <div className="flex size-16 items-center justify-center rounded-3xl border border-white/15 bg-[#080808] text-sky-300 shadow-lg">
                <RiGitBranchLine className="size-9" />
              </div>
              <span className={cx(handFont.className, "text-[19px] whitespace-nowrap text-sky-300")}>chalo, ship karo!</span>
            </motion.div>
          </div>
        </Rise>
        <Rise delay={0.2} className="flex flex-col items-center gap-3">
          <p className="max-w-xl text-headline-regular text-white/65 md:text-title-3-regular">
            One queue for every pull request: who is waiting, what blocks the merge, and the order to read the change.
          </p>
          <p className={cx(handFont.className, "-rotate-1 text-[19px] text-sky-200/75 md:text-[21px]")}>
            matlab, ab koi{" "}
            <span className="relative inline-block text-sky-200">
              &ldquo;bhai, PR dekh lo?&rdquo; nahi
              <svg aria-hidden="true" viewBox="0 0 200 12" preserveAspectRatio="none" className="absolute inset-x-0 -bottom-1.5 h-2.5 w-full text-sky-400/70">
                <motion.path
                  d="M2 8 C 40 2, 70 11, 100 6 S 160 2, 198 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.9, delay: 1.2, ease: EASE }}
                />
              </svg>
            </span>
          </p>
        </Rise>
        <Rise delay={0.3} className="flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
          {startButton}
          <Button asChild variant="outline" size="none" className="group/how h-13 gap-2 border-white/20 bg-white/[0.04] px-7 text-headline-medium text-white hover:bg-white/10">
            <a href="#product">
              See how it works
              <RiArrowDownLine aria-hidden="true" className="size-4 text-white/60 transition-transform duration-300 group-hover/how:translate-y-0.5" />
            </a>
          </Button>
        </Rise>
        <Rise delay={0.4}>
          {notice ? (
            <p role="status" className="text-body-2-regular text-white/45">
              {notice}
            </p>
          ) : (
            <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-caption-1-medium sm:gap-x-5 sm:text-body-2-regular text-white/45">
              {["Free for up to 5 people", "3 repositories", "No card needed"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <RiCheckLine aria-hidden="true" className="size-3.5 text-sky-300/80" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </Rise>
      </Skiper39>

      <div ref={stage} className="relative mx-auto -mt-14 max-w-[1280px] px-3 [perspective:1600px] md:-mt-16 md:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-x-[8%] top-[12%] -z-10 h-[70%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(3_105_161/0.3),rgb(125_200_235/0.08)_55%,transparent)] blur-3xl" />
        <motion.div
          style={{ rotateX, scale, y }}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.5, ease: EASE }}
          className="origin-top rounded-[22px] bg-gradient-to-b from-white/15 to-white/[0.04] p-1.5 shadow-[0_0_0_1px_rgb(255_255_255/0.12),0_0_0_2px_rgb(3_105_161/0.08),0_60px_120px_-30px_rgb(5_35_60/0.55),0_30px_60px_-30px_rgb(0_0_0/0.45)] backdrop-blur md:rounded-[30px] md:p-2.5"
        >
          <AppWindow className="md:rounded-[22px]" />
        </motion.div>
      </div>
    </section>
  );
}

function WorksWith() {
  return (
    <section aria-label="Works with" className="mx-auto max-w-[1200px] px-5 pt-12 pb-8 md:pt-20 md:px-8">
      <p className="text-center text-[13.5px] text-white/45">Works with the tools your team already uses</p>
      <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-5 text-white/45">
        {WORKS_WITH.map((w) => (
          <li key={w.label} className="flex items-center gap-2 text-[17px] font-medium tracking-[-0.02em] transition-colors duration-300 hover:text-white">
            {w.icon}
            {w.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative isolate overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#08090b] ${className ?? ""}`}>
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 60% at 85% 0%, rgb(3 105 161 / 0.16), transparent 70%), radial-gradient(50% 60% at 8% 100%, rgb(170 225 240 / 0.04), transparent 70%), radial-gradient(70% 70% at 50% 50%, rgb(125 200 235 / 0.025), transparent 70%)",
        }}
      />
      <Grain opacity={0.05} className="-z-10" />
      {children}
    </div>
  );
}

function InboxSection() {
  const points = [
    "Review requests, mentions, failing checks and merges in one list",
    "Merge blockers spelled out, not hidden in a status icon",
    "Keyboard first: j and k to move, e to clear",
  ];
  return (
    <section id="product" className="mx-auto max-w-[1200px] scroll-mt-24 px-5 py-24 md:px-8 md:py-36">
      <div className="grid min-w-0 items-center gap-8 md:gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <Reveal>
          <DisplayHeading dark align="left" eyebrow="Inbox" title="Your morning," muted="already sorted." />
          <p className="mt-7 max-w-[30rem] text-[17px] leading-relaxed text-white/60">
            Everything that needs you, from every repository, in the order it needs you. Clear it before stand-up and get back to
            building.
          </p>
          <ul className="mt-8 grid gap-4">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-[15.5px] text-white/75">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#0369a1] text-white">
                  <RiCheckLine className="size-3" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <Stage className="flex items-center justify-center p-2 md:p-2.5">
            <InboxStream />
          </Stage>
        </Reveal>
      </div>
    </section>
  );
}

function OrderSection() {
  const features = [
    { icon: RiListCheck3, title: "Steps, not file lists", body: "Files grouped into a few steps, each with a reason to read it now." },
    { icon: RiHistoryLine, title: "Only what changed", body: "Come back to a pull request and see just the changes since your last review." },
    { icon: RiGitBranchLine, title: "A checklist per repo", body: "The questions your team always asks, ready on every pull request." },
  ];
  return (
    <section id="order" className="scroll-mt-24 bg-[#030303] py-16 md:py-36">
      <div className="mx-auto max-w-[1200px] px-5 md:px-8">
        <Reveal>
          <DisplayHeading dark eyebrow="Guided review" title="Read every change" muted="in the order it makes sense." />
          <p className="mx-auto mt-7 max-w-[36rem] text-center text-[17px] leading-relaxed text-white/60">
            GitHub lists files alphabetically. Docks lists them the way the author would explain them: the new idea first, the
            wiring next, the proof last.
          </p>
        </Reveal>
        <Reveal delay={0.1} className="mt-16">
          <Stage className="p-2 md:p-2.5">
            <div>
              <ReviewOrder />
            </div>
          </Stage>
        </Reveal>
        <div className="mt-10 grid md:mt-16 gap-10 md:grid-cols-3 md:gap-8">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.08} className="border-t border-white/[0.12] pt-6 text-white">
              <span className="flex size-9 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300 ring-1 ring-sky-300/15 ring-inset"><f.icon className="size-[18px]" /></span>
              <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.02em]">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-white/55">{f.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  const features = [
    { icon: RiUserStarLine, title: "Owners, automatically", body: "Each pull request goes to the person who knows that code, with their workload in mind." },
    { icon: RiTimerLine, title: "Work-hour deadlines", body: "Clocks that pause overnight and on weekends, so nobody is late while asleep." },
    { icon: RiUserFollowLine, title: "Backup reviewers", body: "When a review is about to slip, Docks asks the next best person." },
    { icon: RiSlackFill, title: "Slack and Linear", body: "Nudges where your team talks. Issues linked where your team plans." },
  ];
  return (
    <section id="workflow" className="mx-auto max-w-[1200px] scroll-mt-24 px-5 py-24 md:px-8 md:py-36">
      <Reveal>
        <DisplayHeading dark eyebrow="Workflow" title="From pull request" muted="to the right person." />
      </Reveal>
      <Reveal delay={0.1} className="mt-16">
        <Stage className="px-5 py-12 md:px-8 md:py-14">
          <FlowDiagram />
        </Stage>
      </Reveal>
      <div className="mt-10 grid md:mt-16 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
        {features.map((f, i) => (
          <Reveal key={f.title} delay={i * 0.06} className="border-t border-white/[0.12] pt-6 text-white">
            <span className="flex size-9 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300 ring-1 ring-sky-300/15 ring-inset"><f.icon className="size-[18px]" /></span>
            <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.02em]">{f.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-white/55">{f.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function BentoSection() {
  return (
    <section className="bg-[#030303] py-16 md:py-36">
      <div className="mx-auto max-w-[1200px] px-5 md:px-8">
        <Reveal>
          <DisplayHeading dark eyebrow="Everything else" title="A whole review desk." muted="One tab." />
        </Reveal>
        <div className="mt-10 grid md:mt-16 gap-3 md:grid-cols-6">
          <Reveal className="md:col-span-4">
            <BentoCard tone="dark" className="h-full" title="Nothing waits overnight." body="Deadlines count work hours. When one is about to slip, a backup reviewer is asked before anyone notices.">
              <DeadlineBoard />
            </BentoCard>
          </Reveal>
          <Reveal className="md:col-span-2" delay={0.06}>
            <BentoCard tone="dark" className="h-full" title="Know when it ships." body="Group pull requests into a release and watch it fill up.">
              <ReleaseRing />
            </BentoCard>
          </Reveal>
          <Reveal className="md:col-span-2" delay={0.04}>
            <BentoCard tone="brand" className="h-full" title="Everything is ⌘K away." body="Pull requests, releases, people and settings, from any page.">
              <CommandK />
            </BentoCard>
          </Reveal>
          <Reveal className="md:col-span-2" delay={0.08}>
            <BentoCard tone="dark" className="h-full" title="See the queue get shorter." body="Hours to first review, week by week, for the whole team.">
              <InsightBars />
            </BentoCard>
          </Reveal>
          <Reveal className="md:col-span-2" delay={0.12}>
            <BentoCard tone="dark" className="h-full" title="Hand the fix to an agent." body="Send review notes to Claude Code, Codex or Cursor in one click.">
              <AgentStack />
            </BentoCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function PricingTeaser({ startButton }: { startButton: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-[1200px] px-5 py-24 md:px-8 md:py-36">
      <Reveal>
        <DisplayHeading dark eyebrow="Pricing" title="Free to start." muted="Simple when you grow." />
      </Reveal>
      <div className="mx-auto mt-10 grid md:mt-16 max-w-[920px] gap-3 md:grid-cols-2">
        <Reveal>
          <PlanTile plan="free" className="h-full" action={<PillButton href="/signup" className="w-full">Start free</PillButton>} />
        </Reveal>
        <Reveal delay={0.08}>
          <PlanTile plan="team" className="h-full" action={<div className="[&>*]:w-full">{startButton}</div>} />
        </Reveal>
      </div>
      <Reveal className="mt-10 text-center">
        <a href="/pricing" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-white/75 underline-offset-4 hover:text-white hover:underline">
          Compare every feature
          <RiArrowRightLine className="size-4" />
        </a>
      </Reveal>
    </section>
  );
}

function FaqSection() {
  return (
    <section id="faq" className="mx-auto max-w-[880px] scroll-mt-24 px-5 pb-24 md:px-8 md:pb-36">
      <Reveal>
        <h2 className="text-[clamp(2.4rem,5.4vw,4.25rem)] leading-none font-semibold tracking-[-0.045em] text-white">Questions.</h2>
      </Reveal>
      <Reveal delay={0.08} className="mt-12">
        <Faq dark />
      </Reveal>
    </section>
  );
}
