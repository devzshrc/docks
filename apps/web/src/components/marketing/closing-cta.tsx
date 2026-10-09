"use client";

import { NightLight } from "@/components/marketing/backdrop";
import { Reveal } from "@/components/marketing/motion";
import { PillButton } from "@/components/marketing/site-chrome";

/** Graphite closing panel with the main call to action. */
export function ClosingCta({
  startButton,
  secondary = { href: "/pricing", label: "View pricing" },
}: {
  startButton: React.ReactNode;
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="px-3 pb-3 md:px-5 md:pb-5">
      <div className="relative isolate mx-auto max-w-[1360px] overflow-hidden rounded-[32px] px-6 py-24 text-center text-white md:rounded-[40px] md:py-36">
        <NightLight className="-z-10" />
        <Reveal>
          <h2 className="mx-auto max-w-[16ch] text-[clamp(2.6rem,6.4vw,5.25rem)] leading-[0.98] font-semibold tracking-[-0.05em] text-balance">
            Your team&rsquo;s reviews, <span className="bg-gradient-to-r from-[#bbf7d0] to-[#86efac] bg-clip-text text-transparent">finally in order.</span>
          </h2>
          <p className="mx-auto mt-7 max-w-[30rem] text-[17px] leading-relaxed text-white/60">
            Connect GitHub, pick your repositories, and see your queue in under a minute.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {startButton}
            <PillButton href={secondary.href} tone="light" size="lg" className="bg-white/10 text-white hover:bg-white/15">
              {secondary.label}
            </PillButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
