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
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";


import { BrandIcon } from "@/components/brand-icons";
import { useGithubStart } from "@/components/landing/use-github-start";
import { Grain, HeroLight } from "@/components/marketing/backdrop";
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
import { useSession } from "@/lib/auth-client";

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
    <PillButton tone={tone} size={size} onClick={() => void start()} disabled={pending}>
      <RiGithubFill />
      {pending ? "Connecting…" : "Start with GitHub"}
    </PillButton>
  );

  return (
    <MarketingFrame>
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

  const intro = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 18, filter: "blur(8px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 1, delay: 0.08 + i * 0.1, ease: EASE },
  });

  return (
    <section className="relative isolate -mt-16 pt-16">
      <HeroLight />
      <div className="mx-auto max-w-[1200px] px-5 pt-16 text-center md:px-8 md:pt-24">
        <motion.a
          {...intro(0)}
          href="#order"
          className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/70 py-1 pr-3 pl-1 text-[13px] text-[#55555b] shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.04)] backdrop-blur transition-colors hover:text-[#111113]"
        >
          <span className="rounded-full bg-[#0369a1] px-2 py-0.5 text-[11.5px] font-medium text-white">New</span>
          Guided review order for every pull request
          <RiArrowRightLine className="size-3.5" />
        </motion.a>
        <motion.h1
          {...intro(1)}
          className="mx-auto mt-8 max-w-[15ch] text-[clamp(3.4rem,9.5vw,8rem)] leading-[0.92] font-semibold tracking-[-0.055em] text-balance"
        >
          <span className="block">Code review,</span>
          <span className="block text-[#0369a1]">without the wait.</span>
        </motion.h1>
        <motion.p {...intro(2)} className="mx-auto mt-8 max-w-[36rem] text-[17px] leading-relaxed text-[#55555b] md:text-[19px]">
          One queue for every pull request: who is waiting, what blocks the merge, and the order to read the change.
        </motion.p>
        <motion.div {...intro(3)} className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {startButton}
          <PillButton tone="light" size="lg" href="#product">
            See how it works
            <RiArrowDownLine />
          </PillButton>
        </motion.div>
        <motion.p {...intro(4)} className="mt-5 text-[13.5px] text-[#8b8b92]">
          {notice ?? "Free for up to 5 people and 3 repositories. No card needed."}
        </motion.p>
      </div>

      <div ref={stage} className="relative mx-auto mt-16 max-w-[1280px] px-3 [perspective:1600px] md:mt-20 md:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-x-[8%] top-[12%] -z-10 h-[70%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(3_105_161/0.45),rgb(125_200_235/0.2)_55%,transparent)] blur-3xl" />
        <motion.div
          style={{ rotateX, scale, y }}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.5, ease: EASE }}
          className="origin-top rounded-[22px] bg-gradient-to-b from-white/70 to-white/30 p-1.5 shadow-[0_0_0_1px_rgb(255_255_255/0.6),0_0_0_2px_rgb(3_105_161/0.08),0_60px_120px_-30px_rgb(5_35_60/0.55),0_30px_60px_-30px_rgb(0_0_0/0.45)] backdrop-blur md:rounded-[30px] md:p-2.5"
        >
          <AppWindow className="md:rounded-[22px]" />
        </motion.div>
      </div>
    </section>
  );
}

function WorksWith() {
  return (
    <section aria-label="Works with" className="mx-auto max-w-[1200px] px-5 pt-20 pb-8 md:px-8">
      <p className="text-center text-[13.5px] text-[#8b8b92]">Works with the tools your team already uses</p>
      <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-5 text-[#a1a1aa]">
        {WORKS_WITH.map((w) => (
          <li key={w.label} className="flex items-center gap-2 text-[17px] font-medium tracking-[-0.02em] transition-colors duration-300 hover:text-[#111113]">
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
    <div className={`relative isolate overflow-hidden rounded-[24px] bg-[#f4f4f5] ${className ?? ""}`}>
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 60% at 85% 0%, rgb(3 105 161 / 0.16), transparent 70%), radial-gradient(50% 60% at 8% 100%, rgb(170 225 240 / 0.1), transparent 70%), radial-gradient(70% 70% at 50% 50%, rgb(125 200 235 / 0.06), transparent 70%)",
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
      <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <Reveal>
          <DisplayHeading align="left" eyebrow="Inbox" title="Your morning," muted="already sorted." />
          <p className="mt-7 max-w-[30rem] text-[17px] leading-relaxed text-[#55555b]">
            Everything that needs you, from every repository, in the order it needs you. Clear it before stand-up and get back to
            building.
          </p>
          <ul className="mt-8 grid gap-4">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-[15.5px] text-[#3f3f46]">
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
    <section id="order" className="scroll-mt-24 bg-[#fafafa] py-24 md:py-36">
      <div className="mx-auto max-w-[1200px] px-5 md:px-8">
        <Reveal>
          <DisplayHeading eyebrow="Guided review" title="Read every change" muted="in the order it makes sense." />
          <p className="mx-auto mt-7 max-w-[36rem] text-center text-[17px] leading-relaxed text-[#55555b]">
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
        <div className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.08} className="border-t border-black/[0.08] pt-6">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[#0369a1]/[0.08] text-[#0369a1] ring-1 ring-[#0369a1]/15 ring-inset"><f.icon className="size-[18px]" /></span>
              <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.02em]">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[#6b6b70]">{f.body}</p>
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
        <DisplayHeading eyebrow="Workflow" title="From pull request" muted="to the right person." />
      </Reveal>
      <Reveal delay={0.1} className="mt-16">
        <Stage className="px-5 py-12 md:px-8 md:py-14">
          <FlowDiagram />
        </Stage>
      </Reveal>
      <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
        {features.map((f, i) => (
          <Reveal key={f.title} delay={i * 0.06} className="border-t border-black/[0.08] pt-6">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#0369a1]/[0.08] text-[#0369a1] ring-1 ring-[#0369a1]/15 ring-inset"><f.icon className="size-[18px]" /></span>
            <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.02em]">{f.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-[#6b6b70]">{f.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function BentoSection() {
  return (
    <section className="bg-[#fafafa] py-24 md:py-36">
      <div className="mx-auto max-w-[1200px] px-5 md:px-8">
        <Reveal>
          <DisplayHeading eyebrow="Everything else" title="A whole review desk." muted="One tab." />
        </Reveal>
        <div className="mt-16 grid gap-3 md:grid-cols-6">
          <Reveal className="md:col-span-4">
            <BentoCard className="h-full" title="Nothing waits overnight." body="Deadlines count work hours. When one is about to slip, a backup reviewer is asked before anyone notices.">
              <DeadlineBoard />
            </BentoCard>
          </Reveal>
          <Reveal className="md:col-span-2" delay={0.06}>
            <BentoCard className="h-full" title="Know when it ships." body="Group pull requests into a release and watch it fill up.">
              <ReleaseRing />
            </BentoCard>
          </Reveal>
          <Reveal className="md:col-span-2" delay={0.04}>
            <BentoCard tone="brand" className="h-full" title="Everything is ⌘K away." body="Pull requests, releases, people and settings, from any page.">
              <CommandK />
            </BentoCard>
          </Reveal>
          <Reveal className="md:col-span-2" delay={0.08}>
            <BentoCard className="h-full" title="See the queue get shorter." body="Hours to first review, week by week, for the whole team.">
              <InsightBars />
            </BentoCard>
          </Reveal>
          <Reveal className="md:col-span-2" delay={0.12}>
            <BentoCard className="h-full" title="Hand the fix to an agent." body="Send review notes to Claude Code, Codex or Cursor in one click.">
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
        <DisplayHeading eyebrow="Pricing" title="Free to start." muted="Simple when you grow." />
      </Reveal>
      <div className="mx-auto mt-16 grid max-w-[920px] gap-3 md:grid-cols-2">
        <Reveal>
          <PlanTile plan="free" className="h-full" action={<PillButton href="/signup" tone="dark" className="w-full">Start free</PillButton>} />
        </Reveal>
        <Reveal delay={0.08}>
          <PlanTile plan="team" className="h-full" action={<div className="[&>*]:w-full">{startButton}</div>} />
        </Reveal>
      </div>
      <Reveal className="mt-10 text-center">
        <a href="/pricing" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[#111113] underline-offset-4 hover:underline">
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
        <h2 className="text-[clamp(2.4rem,5.4vw,4.25rem)] leading-none font-semibold tracking-[-0.045em]">Questions.</h2>
      </Reveal>
      <Reveal delay={0.08} className="mt-12">
        <Faq />
      </Reveal>
    </section>
  );
}
