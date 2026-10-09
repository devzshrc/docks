"use client";

import { RiCheckLine, RiGithubFill, RiKeyboardLine, RiLockPasswordLine, RiShieldUserLine, RiFileList2Line, RiSubtractLine } from "@remixicon/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { useGithubStart } from "@/components/landing/use-github-start";
import { HeroLight } from "@/components/marketing/backdrop";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { Faq } from "@/components/marketing/faq";
import { DisplayHeading, EASE, Reveal } from "@/components/marketing/motion";
import { PlanTile } from "@/components/marketing/plan-tiles";
import { COMPARE, FREE_MEMBERS, TEAM_PRICE } from "@/components/marketing/plans";
import { MarketingFrame, PillButton } from "@/components/marketing/site-chrome";
import { cn } from "@/lib/utils";

const INCLUDED = [
  { icon: RiGithubFill, title: "GitHub permissions", body: "People see only the repositories they can open on GitHub." },
  { icon: RiLockPasswordLine, title: "Two-factor sign-in", body: "Authenticator apps and backup codes for every account." },
  { icon: RiFileList2Line, title: "Audit log", body: "A record of who changed what in your workspace." },
  { icon: RiKeyboardLine, title: "Keyboard first", body: "⌘K to jump anywhere, j and k to move through any list." },
];

/** Digits that roll when the number changes. */
function Rolling({ value }: { value: string }) {
  return (
    <span className="inline-flex overflow-hidden tabular-nums">
      {value.split("").map((ch, i) => (
        <span key={i} className="relative inline-block">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ch + i}
              initial={{ y: "70%", opacity: 0, filter: "blur(4px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={{ y: "-70%", opacity: 0, filter: "blur(4px)" }}
              transition={{ duration: 0.35, ease: EASE }}
              className="inline-block"
            >
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

function SeatEstimator() {
  const [seats, setSeats] = useState(12);
  const total = (seats * TEAM_PRICE).toLocaleString("en-US");
  return (
    <div className="mt-6 rounded-2xl bg-white/[0.06] p-4 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
      <div className="flex items-center justify-between text-[13px]">
        <label htmlFor="seats" className="text-white/60">Team size</label>
        <span className="font-medium text-white tabular-nums">{seats} people</span>
      </div>
      <input
        id="seats"
        type="range"
        min={1}
        max={100}
        value={seats}
        onChange={(e) => setSeats(Number(e.target.value))}
        className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-white [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgb(0_0_0/0.5)]"
        style={{ background: `linear-gradient(to right, white ${seats}%, rgb(255 255 255 / 0.15) ${seats}%)` }}
      />
      <div className="mt-4 flex items-baseline justify-between text-[13px] text-white/60">
        <span>Estimated monthly total</span>
        <span className="text-[22px] font-semibold tracking-[-0.03em] text-white">
          $<Rolling value={total} />
        </span>
      </div>
    </div>
  );
}

function Cell({ value, dark }: { value: boolean | string; dark?: boolean }) {
  if (typeof value === "string") return <span className={cn("text-[14px]", dark ? "font-medium text-[#111113]" : "text-[#55555b]")}>{value}</span>;
  return value ? (
    <span className={cn("inline-flex size-5 items-center justify-center rounded-full", dark ? "bg-[#e8590c] text-white" : "bg-[#e8590c]/10 text-[#e8590c]")} aria-label="Included">
      <RiCheckLine className="size-3" />
    </span>
  ) : (
    <RiSubtractLine className="inline size-4 text-[#c4c4c9]" aria-label="Not included" />
  );
}

export function PricingPage() {
  const { start, pending } = useGithubStart();
  const github = (tone: "dark" | "white", className?: string) => (
    <PillButton tone={tone} onClick={() => void start()} disabled={pending} className={className}>
      <RiGithubFill />
      {pending ? "Connecting…" : "Start with GitHub"}
    </PillButton>
  );

  return (
    <MarketingFrame>
      <main>
        <section className="relative isolate -mt-16 pt-16">
          <HeroLight />
          <div className="mx-auto max-w-[1200px] px-5 pt-16 md:px-8 md:pt-24">
            <motion.div initial={{ opacity: 0, y: 18, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 1, ease: EASE }}>
              <DisplayHeading as="h1" eyebrow="Pricing" title="Start free." muted="Grow without surprises." className="[&_h1]:text-[clamp(2.8rem,7vw,5.5rem)]" />
              <p className="mx-auto mt-7 max-w-[34rem] text-center text-[17px] leading-relaxed text-[#55555b] md:text-[19px]">
                Every team gets the review queue and guided review. Team adds the tools that keep reviews on time, up to the release.
              </p>
            </motion.div>
            <div className="mx-auto mt-16 grid max-w-[960px] gap-3 md:grid-cols-2">
              <Reveal>
                <PlanTile
                  plan="free"
                  className="h-full"
                  note={`For teams of up to ${FREE_MEMBERS}. No card needed.`}
                  action={<PillButton href="/signup" className="w-full">Start free</PillButton>}
                />
              </Reveal>
              <Reveal delay={0.08}>
                <PlanTile plan="team" className="h-full" note={<SeatEstimator />} action={github("white", "w-full")} />
              </Reveal>
            </div>
            <p className="mt-6 text-center text-[13px] text-[#8b8b92]">
              Prices in USD. Team is billed monthly for each workspace member, plus applicable taxes.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-5 py-24 md:px-8 md:py-32">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {INCLUDED.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.06} className="border-t border-black/[0.08] pt-6">
                <f.icon className="size-5" />
                <h3 className="mt-4 text-[16px] font-semibold tracking-[-0.02em]">{f.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[#6b6b70]">{f.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="bg-[#fafafa] py-24 md:py-32">
          <div className="mx-auto max-w-[1040px] px-5 md:px-8">
            <Reveal>
              <DisplayHeading title="Compare plans." muted="Line by line." />
            </Reveal>
            <Reveal delay={0.08} className="mt-14">
              <div className="overflow-clip rounded-[28px] bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_30px_60px_-40px_rgb(0_0_0/0.25)]">
                <div className="sticky top-16 z-10 grid grid-cols-[1.6fr_1fr_1fr] items-end gap-4 border-b border-black/[0.06] bg-white/90 px-5 py-5 backdrop-blur md:px-8">
                  <span className="text-[13px] text-[#8b8b92]">Features</span>
                  <span className="grid justify-items-center gap-2 text-center">
                    <span className="text-[15px] font-semibold tracking-[-0.02em]">Free</span>
                    <span className="hidden text-[12.5px] text-[#8b8b92] sm:block">$0</span>
                  </span>
                  <span className="grid justify-items-center gap-2 text-center">
                    <span className="text-[15px] font-semibold tracking-[-0.02em]">Team</span>
                    <span className="hidden text-[12.5px] text-[#8b8b92] sm:block">${TEAM_PRICE} per member</span>
                  </span>
                </div>
                {COMPARE.map((g) => (
                  <div key={g.group}>
                    <div className="bg-[#fafafa] px-5 py-3 text-[12px] font-medium tracking-[0.06em] text-[#8b8b92] uppercase md:px-8">{g.group}</div>
                    {g.rows.map(([label, free, team]) => (
                      <div key={label} className="grid grid-cols-[1.6fr_1fr_1fr] items-center gap-4 border-t border-black/[0.05] px-5 py-4 transition-colors hover:bg-[#fafafa] md:px-8">
                        <span className="text-[14.5px] text-[#3f3f46]">{label}</span>
                        <span className="text-center"><Cell value={free} /></span>
                        <span className="text-center"><Cell value={team} dark /></span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="grid grid-cols-[1.6fr_1fr_1fr] items-center gap-4 border-t border-black/[0.06] px-5 py-6 md:px-8">
                  <span />
                  <span className="flex justify-center"><PillButton href="/signup" tone="light" size="sm">Start free</PillButton></span>
                  <span className="flex justify-center"><PillButton href="/settings/billing" size="sm">Choose Team</PillButton></span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-[880px] px-5 py-24 md:px-8 md:py-32">
          <Reveal>
            <h2 className="text-[clamp(2.4rem,5.4vw,4.25rem)] leading-none font-semibold tracking-[-0.045em]">Questions.</h2>
          </Reveal>
          <Reveal delay={0.08} className="mt-12">
            <Faq />
          </Reveal>
        </section>

        <ClosingCta startButton={github("white")} secondary={{ href: "/#product", label: "Tour the product" }} />
      </main>
    </MarketingFrame>
  );
}
