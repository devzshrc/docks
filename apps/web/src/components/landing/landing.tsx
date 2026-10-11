"use client";

import { RiArrowRightLine, RiGithubFill } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LandingNav } from "@/components/landing/nav";
import { ProductWindow } from "@/components/landing/product-window";
import { Faq, FinalCta, HowItWorks, LandingFooter, Pricing, Problem } from "@/components/landing/sections";
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
        <section className="landing-sky px-4 pt-32 pb-20 sm:px-6 md:pt-40 md:pb-28">
          <div className="l-fade-up mx-auto flex max-w-[760px] flex-col items-center text-center">
            <h1 className="font-display text-[36px] leading-[40px] font-medium text-balance sm:text-[48px] sm:leading-[52px] md:text-[60px] md:leading-[64px]">
              Every pull request, reviewed in the right order.
            </h1>
            <p className="mt-5 max-w-[560px] text-[17px] leading-[26px] text-pretty text-[var(--l-ink-2)] md:text-[18px] md:leading-[28px]">
              Docks puts your team's GitHub reviews in one queue, guides you through each change, and posts comments and approvals back to GitHub.
            </p>
            <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
              {startButton}
              <a href="#how" className="l-btn l-btn-secondary h-12 w-full px-6 sm:w-auto">
                See how it works
                <RiArrowRightLine className="size-4 text-[var(--l-ink-3)]" />
              </a>
            </div>
            <p role="status" className="mt-4 min-h-5 text-[13px] text-[var(--l-ink-2)]">{notice}</p>
          </div>
          <div className="l-fade-up mt-10 md:mt-14" style={{ animationDelay: "120ms" }}>
            <ProductWindow />
          </div>
        </section>
        <Problem />
        <HowItWorks />
        <Pricing onStart={onStart} />
        <Faq />
        <FinalCta action={startButton} />
      </main>
      <LandingFooter />
    </div>
  );
}
