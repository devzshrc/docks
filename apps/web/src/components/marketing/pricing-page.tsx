"use client";

import { RiCheckLine, RiFileList2Line, RiGithubFill, RiKeyboardLine, RiLockPasswordLine } from "@remixicon/react";
import { AnimatePresence, motion } from "motion/react";
import { Bricolage_Grotesque, Instrument_Serif } from "next/font/google";
import { useState } from "react";

import { useGithubStart } from "@/components/landing/use-github-start";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { Faq } from "@/components/marketing/faq";
import { EASE, Reveal } from "@/components/marketing/motion";
import { PlanTile } from "@/components/marketing/plan-tiles";
import { COMPARE, FREE_MEMBERS, TEAM_PRICE } from "@/components/marketing/plans";
import { MarketingFrame, PillButton } from "@/components/marketing/site-chrome";
import { cx } from "@/utils/cx";

const displayFont = Bricolage_Grotesque({ subsets: ["latin"], display: "swap" });
const serifFont = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", display: "swap" });

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
  const fill = ((seats - 1) / 99) * 100;
  return (
    <div className="mt-7 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-center justify-between text-[12.5px]">
        <label htmlFor="seats" className="text-white/45">Team size</label>
        <span className="font-medium text-white/85 tabular-nums">{seats} {seats === 1 ? "person" : "people"}</span>
      </div>
      <input
        id="seats"
        type="range"
        min={1}
        max={100}
        value={seats}
        onChange={(e) => setSeats(Number(e.target.value))}
        className="mt-3.5 h-[3px] w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-4 focus-visible:ring-offset-[#07090c] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgb(56_189_248/0.25),0_2px_8px_rgb(0_0_0/0.6)] [&::-webkit-slider-thumb]:transition-shadow hover:[&::-webkit-slider-thumb]:shadow-[0_0_0_7px_rgb(56_189_248/0.25),0_2px_8px_rgb(0_0_0/0.6)]"
        style={{ background: `linear-gradient(to right, rgb(125 211 252) ${fill}%, rgb(255 255 255 / 0.12) ${fill}%)` }}
      />
      <div className="mt-4 flex items-baseline justify-between text-[12.5px] text-white/45">
        <span>Estimated monthly total</span>
        <span className="text-[20px] font-light tracking-[-0.03em] text-white">
          $<Rolling value={total} />
        </span>
      </div>
    </div>
  );
}

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "string") return <span className="text-[13.5px] text-white/70">{value}</span>;
  return value ? (
    <RiCheckLine className="inline size-4 text-sky-300" aria-label="Included" />
  ) : (
    <span aria-label="Not included" className="inline-block h-px w-3 bg-white/20" />
  );
}

export function PricingPage() {
  const { start, pending } = useGithubStart();
  const github = (tone: "brand" | "white", className?: string) => (
    <PillButton tone={tone} onClick={() => void start()} disabled={pending} className={className}>
      <RiGithubFill />
      {pending ? "Connecting…" : "Start with GitHub"}
    </PillButton>
  );

  return (
    <MarketingFrame dark>
      <main>
        <section className="relative isolate -mt-16 overflow-hidden pt-16">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute top-[-40%] left-1/2 h-[90%] w-[90%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(3_105_161/0.3),rgb(3_105_161/0.06)_60%,transparent)] blur-2xl" />
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgb(255 255 255 / 0.035) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.035) 1px, transparent 1px)",
                backgroundSize: "64px 64px",
                backgroundPosition: "center top",
                maskImage: "radial-gradient(70% 60% at 50% 20%, black, transparent 80%)",
              }}
            />
            <div className="absolute inset-x-0 top-16 h-px bg-gradient-to-r from-transparent via-sky-300/25 to-transparent" />
          </div>
          <div className="mx-auto max-w-[1200px] px-5 pt-16 md:px-8 md:pt-24">
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 1, ease: EASE }}
            >
              <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-white/55">
                <span className="size-1.5 rounded-full bg-sky-400 shadow-[0_0_10px_rgb(56_189_248/0.7)]" />
                Pricing
              </p>
              <h1 className={cx(displayFont.className, "mt-6 text-[clamp(2.6rem,6.4vw,5rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance text-white")}>
                Start free.{" "}
                <span className={cx(serifFont.className, "bg-gradient-to-b from-white from-40% to-sky-200 bg-clip-text pe-[0.06em] text-[1.1em] font-normal tracking-[-0.01em] text-transparent")}>
                  Grow calmly.
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-[33rem] text-[16.5px] leading-relaxed text-white/50 md:text-[18px]">
                Every team gets the review queue and guided review. Team adds the tools that keep reviews on time, up to the release.
              </p>
            </motion.div>
            <div className="mx-auto mt-14 grid max-w-[940px] gap-4 md:mt-16 md:grid-cols-2">
              <Reveal>
                <PlanTile
                  plan="free"
                  className="h-full"
                  note={`For teams of up to ${FREE_MEMBERS}. No card needed.`}
                  action={
                    <PillButton href="/signup" tone="dark" className="w-full border border-white/10 bg-white/[0.04] shadow-none hover:bg-white/[0.09]">
                      Start free
                    </PillButton>
                  }
                />
              </Reveal>
              <Reveal delay={0.08}>
                <PlanTile plan="team" className="h-full" footer={<SeatEstimator />} action={github("brand", "w-full")} />
              </Reveal>
            </div>
            <p className="mt-6 text-center text-[12.5px] text-white/35">
              Prices in USD. Team is billed monthly for each workspace member, plus applicable taxes.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1100px] px-5 py-20 md:px-8 md:py-28">
          <div className="grid gap-px overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-4">
            {INCLUDED.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.05} className="group/inc bg-black p-6 transition-colors duration-300 hover:bg-white/[0.02]">
                <f.icon className="size-[18px] text-sky-300/80 transition-transform duration-300 group-hover/inc:-translate-y-0.5" />
                <h3 className="mt-5 text-[14.5px] font-medium tracking-[-0.01em] text-white/90">{f.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/45">{f.body}</p>
              </Reveal>
            ))}
          </div>
          <p className="mt-4 text-center text-[12.5px] text-white/30">Included on every plan.</p>
        </section>

        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-[900px] px-5 md:px-8">
            <Reveal>
              <h2 className={cx(displayFont.className, "text-center text-[clamp(2rem,4.4vw,3.2rem)] leading-[1.05] font-semibold tracking-[-0.04em] text-white")}>
                Compare plans.{" "}
                <span className={cx(serifFont.className, "font-normal text-white/45")}>Line by line.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.08} className="mt-12">
              <div className="relative">
                <div className="sticky top-16 z-10 grid grid-cols-[1.5fr_1fr_1fr] items-end border-b border-white/[0.08] bg-black/75 backdrop-blur-xl">
                  <span className="px-4 py-4 text-[12.5px] text-white/35 md:px-6">Features</span>
                  <span className="px-2 py-4 text-center">
                    <span className="block text-[14px] font-medium text-white/85">Free</span>
                    <span className="mt-0.5 hidden text-[12px] text-white/35 sm:block">$0</span>
                  </span>
                  <span className="rounded-t-2xl bg-sky-400/[0.05] px-2 py-4 text-center">
                    <span className="block text-[14px] font-medium text-sky-200">Team</span>
                    <span className="mt-0.5 hidden text-[12px] text-white/35 sm:block">${TEAM_PRICE} per member</span>
                  </span>
                </div>
                {COMPARE.map((g) => (
                  <div key={g.group}>
                    <div className="grid grid-cols-[1.5fr_1fr_1fr]">
                      <p className="px-4 pt-8 pb-3 text-[11px] font-medium tracking-[0.14em] text-white/30 uppercase md:px-6">{g.group}</p>
                      <span />
                      <span className="bg-sky-400/[0.05]" />
                    </div>
                    {g.rows.map(([label, free, team]) => (
                      <div key={label} className="group/row grid grid-cols-[1.5fr_1fr_1fr] items-center border-t border-white/[0.05] transition-colors duration-200 hover:bg-white/[0.02]">
                        <span className="px-4 py-3.5 text-[14px] text-white/70 transition-colors group-hover/row:text-white md:px-6">{label}</span>
                        <span className="px-2 text-center"><Cell value={free} /></span>
                        <span className="flex items-center justify-center self-stretch bg-sky-400/[0.05] px-2"><Cell value={team} /></span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="grid grid-cols-[1.5fr_1fr_1fr] items-center border-t border-white/[0.08]">
                  <span />
                  <span className="flex justify-center px-2 py-6">
                    <PillButton href="/signup" tone="dark" size="sm" className="border border-white/10 bg-white/[0.04] shadow-none hover:bg-white/[0.09]">Start free</PillButton>
                  </span>
                  <span className="flex justify-center self-stretch rounded-b-2xl bg-sky-400/[0.05] px-2 py-6">
                    <PillButton href="/settings/billing" size="sm">Choose Team</PillButton>
                  </span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-[820px] px-5 py-20 md:px-8 md:py-28">
          <Reveal>
            <h2 className={cx(displayFont.className, "text-[clamp(2rem,4.4vw,3.2rem)] leading-[1.05] font-semibold tracking-[-0.04em] text-white")}>Questions.</h2>
          </Reveal>
          <Reveal delay={0.08} className="mt-10">
            <Faq dark />
          </Reveal>
        </section>

        <ClosingCta startButton={github("white")} secondary={{ href: "/#product", label: "Tour the product" }} />
      </main>
    </MarketingFrame>
  );
}
