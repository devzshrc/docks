"use client";

import { RiArrowRightLine, RiGithubFill } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { HeroOrbit, HeroRise } from "@/components/landing/hero-orbit";
import { PeepTrail } from "@/components/landing/peep-trail";
import { LandingNav } from "@/components/landing/nav";
import { Faq, FinalCta, HowItWorks, LandingFooter, Pricing } from "@/components/landing/sections";
import { StorySection } from "@/components/landing/story";
import { useGithubStart } from "@/components/landing/use-github-start";
import { useSession } from "@/lib/auth-client";

export function Landing() {
  const { start, pending, notice } = useGithubStart();
  const { data } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (data?.user) router.replace("/review");
  }, [data, router]);

  const onStart = () => void start();
  const startButton = (
    <button type="button" onClick={onStart} disabled={pending} aria-busy={pending} className="l-btn l-btn-primary h-12 w-full px-6 disabled:opacity-70 sm:w-auto">
      <RiGithubFill className="size-[18px]" />
      {pending ? "Connecting…" : "Start free with GitHub"}
    </button>
  );

  return (
    <div className="landing min-h-svh">
      <LandingNav onStart={onStart} />
      <main>
        <HeroOrbit
          headline="Every pull request, reviewed in the right order."
          actions={
            <>
              <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                {startButton}
                <span className="max-[820px]:hidden">
                  <a href="#how" className="l-btn l-btn-secondary h-12 px-6">
                    See how it works
                    <RiArrowRightLine className="size-4 text-[var(--l-ink-3)]" />
                  </a>
                </span>
              </div>
              <p role="status" className="mt-3 min-h-5 text-[13px] text-[var(--l-ink-2)]">
                {notice}
              </p>
            </>
          }
        />
        <HeroRise>
          <StorySection />
        </HeroRise>
        {/* Positioned so it paints over the pinned hero stage as that scrolls away. */}
        <div className="relative z-10 bg-[var(--l-bg)]">
          <HowItWorks />
          <Pricing onStart={onStart} />
          <Faq />
          <FinalCta action={startButton} />
        </div>
      </main>
      <PeepTrail />
      <LandingFooter />
    </div>
  );
}
