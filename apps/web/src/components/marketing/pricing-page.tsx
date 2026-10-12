"use client";

import { RiAddLine, RiCheckLine, RiGithubFill, RiSubtractLine } from "@remixicon/react";
import { Fragment, useState } from "react";
import { LandingNav } from "@/components/landing/nav";
import { container, Faq, FinalCta, LandingFooter, PlanCards } from "@/components/landing/sections";
import { useGithubStart } from "@/components/landing/use-github-start";
import { COMPARE, TEAM_PRICE } from "@/components/marketing/plans";
import { cx } from "@/utils/cx";

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "string") return <span className="text-[14px] text-[var(--l-ink)]">{value}</span>;
  return value ? (
    <RiCheckLine className="mx-auto size-[18px] text-[var(--l-blue)]" aria-label="Included" />
  ) : (
    <span className="text-[var(--l-ink-3)]" aria-label="Not included">—</span>
  );
}

const stepper =
  "grid size-9 place-items-center rounded-full bg-[var(--l-surface)] text-[var(--l-ink)] shadow-[0_0_0_1px_var(--l-line)] transition-colors hover:bg-[var(--l-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--l-blue)] disabled:opacity-40";

function SeatEstimator() {
  const [seats, setSeats] = useState(12);
  return (
    <section aria-labelledby="estimate-heading" className={cx(container, "pb-20 md:pb-32")}>
      <div className="mx-auto flex max-w-[800px] flex-col gap-6 rounded-2xl bg-[var(--l-soft)] p-6 ring-1 ring-[var(--l-line)] sm:flex-row sm:items-center sm:justify-between md:p-8">
        <div>
          <h2 id="estimate-heading" className="font-display text-[18px] leading-6 font-semibold">
            Estimate your Team plan
          </h2>
          <p className="mt-1 text-[14px] leading-5 text-[var(--l-ink-2)]">
            ${TEAM_PRICE} USD per member per month, plus applicable taxes.
          </p>
        </div>
        <div className="flex items-center justify-between gap-6 sm:justify-end">
          <div className="flex items-center gap-3">
            <button type="button" className={stepper} aria-label="Remove one member" disabled={seats === 1} onClick={() => setSeats(seats - 1)}>
              <RiSubtractLine className="size-4" />
            </button>
            <span className="w-[86px] text-center text-[14px] font-medium tabular-nums">
              {seats} {seats === 1 ? "member" : "members"}
            </span>
            <button type="button" className={stepper} aria-label="Add one member" disabled={seats === 100} onClick={() => setSeats(seats + 1)}>
              <RiAddLine className="size-4" />
            </button>
          </div>
          <output aria-live="polite" className="font-display min-w-[110px] text-right text-[24px] leading-none font-medium tabular-nums">
            ${seats * TEAM_PRICE}
            <span className="ml-1 font-sans text-[13px] font-normal tracking-normal text-[var(--l-ink-3)]">/mo</span>
          </output>
        </div>
      </div>
    </section>
  );
}

function CompareTable() {
  return (
    <section aria-labelledby="compare-heading" className="scroll-mt-16 border-t border-[var(--l-line)] py-20 md:py-32">
      <div className={container}>
        <h2 id="compare-heading" className="font-display mb-10 text-center text-[30px] leading-[36px] font-medium md:mb-14 md:text-[40px] md:leading-[44px]">
          Compare plans
        </h2>
        <div className="mx-auto max-w-[800px]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--l-line)]">
                <th scope="col" className="py-3 pr-4 text-[13px] font-medium text-[var(--l-ink-3)]">Feature</th>
                <th scope="col" className="w-[22%] py-3 sm:w-[28%] text-center text-[14px] font-semibold">Free</th>
                <th scope="col" className="w-[22%] py-3 sm:w-[28%] text-center text-[14px] font-semibold">Team</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((group) => (
                <Fragment key={group.group}>
                  <tr>
                    <th scope="colgroup" colSpan={3} className="pt-8 pb-2 text-[12px] font-medium tracking-[0.04em] text-[var(--l-ink-3)] uppercase">
                      {group.group}
                    </th>
                  </tr>
                  {group.rows.map(([label, free, team]) => (
                    <tr key={label} className="border-b border-[var(--l-line)]">
                      <th scope="row" className="py-3.5 pr-4 text-[14px] leading-5 font-normal text-[var(--l-ink-2)]">{label}</th>
                      <td className="py-3.5 text-center"><Cell value={free} /></td>
                      <td className="py-3.5 text-center"><Cell value={team} /></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function PricingPage() {
  const { start, pending, notice } = useGithubStart();
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
          <div className="l-fade-up mx-auto mb-12 max-w-[640px] text-center md:mb-16">
            <h1 className="font-display text-[36px] leading-[40px] font-medium text-balance sm:text-[48px] sm:leading-[52px] md:text-[56px] md:leading-[60px]">
              Simple pricing for every review queue.
            </h1>
            <p className="mt-5 text-[17px] leading-[26px] text-pretty text-[var(--l-ink-2)] md:text-[18px] md:leading-[28px]">
              Start free. Team is ${TEAM_PRICE} USD per member per month, plus applicable taxes.
            </p>
            <p role="status" className="mt-3 min-h-5 text-[13px] text-[var(--l-ink-2)]">{notice}</p>
          </div>
          <div className="l-fade-up" style={{ animationDelay: "120ms" }}>
            <PlanCards onStart={onStart} />
          </div>
        </section>
        <SeatEstimator />
        <CompareTable />
        <Faq />
        <FinalCta action={startButton} />
      </main>
      <LandingFooter />
    </div>
  );
}
