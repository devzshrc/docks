import { RiCheckLine } from "@remixicon/react";
import type { ReactNode } from "react";
import { AppIcon } from "@/components/app-icon";
import { FAQ } from "@/components/marketing/plans";
import { PLAN_OPTIONS } from "@/components/landing/plan-options";
import { cx } from "@/utils/cx";

export const container = "mx-auto w-full max-w-[1120px] px-4 sm:px-6";

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="mx-auto mb-12 max-w-[640px] text-center md:mb-16">
      <p className="mb-3 text-[13px] font-medium text-[var(--l-blue)]">{eyebrow}</p>
      <h2 className="font-display text-[30px] leading-[36px] font-medium tracking-[-0.03em] text-balance md:text-[40px] md:leading-[44px]">
        {title}
      </h2>
      <p className="mt-4 text-[16px] leading-6 text-pretty text-[var(--l-ink-2)] md:text-[17px] md:leading-[26px]">{body}</p>
    </div>
  );
}

const PROBLEMS = [
  { n: "01", title: "Reviews hide in notifications", body: "Requests are buried between CI noise and mentions, so pull requests sit for days without anyone noticing." },
  { n: "02", title: "Big diffs have no reading order", body: "Forty files in alphabetical order. Reviewers skim, miss the important change and approve anyway." },
  { n: "03", title: "Nobody knows whose turn it is", body: "Authors wait on reviewers and reviewers wait on authors. The pull request stalls in between." },
];

export function Problem() {
  return (
    <section id="problem" className="scroll-mt-16 py-20 md:py-32">
      <div className={container}>
        <SectionHead eyebrow="The problem" title="Code review is where good work goes to wait." body="GitHub stores your pull requests well. It doesn't help your team decide what to read next." />
        <div className="grid gap-px overflow-hidden rounded-2xl bg-[var(--l-line)] ring-1 ring-[var(--l-line)] md:grid-cols-3">
          {PROBLEMS.map((p) => (
            <div key={p.n} className="bg-white p-6 md:p-8">
              <p className="font-mono text-[12px] text-[var(--l-ink-3)]">{p.n}</p>
              <h3 className="font-display mt-6 text-[18px] leading-6 font-semibold tracking-[-0.015em]">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-6 text-[var(--l-ink-2)]">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { title: "Connect GitHub", body: "Sign in with GitHub and pick your repositories. Nothing to install in your codebase.", demo: <Pill>acme/api · acme/web · acme/infra</Pill> },
  { title: "See one queue", body: "Every pull request that needs you, sorted by who has waited longest.", demo: <Pill>3 need review · 1 is your turn</Pill> },
  { title: "Review and post back", body: "Read files in a guided order. Comments and approvals go straight to GitHub.", demo: <Pill><RiCheckLine className="size-3.5 text-[#16a34a]" />Approved on GitHub</Pill> },
];

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] text-[var(--l-ink-2)] shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.04)]">
      {children}
    </span>
  );
}

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-16 bg-[#fafafa] py-20 md:py-32">
      <div className={container}>
        <SectionHead eyebrow="How it works" title="From sign-in to first review in two minutes." body="Docks sits on top of GitHub. Your history, branches and permissions stay where they are." />
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col rounded-2xl bg-white p-6 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.03)] md:p-8">
              <span className="grid size-7 place-items-center rounded-full bg-[var(--l-ink)] font-mono text-[12px] text-white">{i + 1}</span>
              <h3 className="font-display mt-6 text-[18px] leading-6 font-semibold tracking-[-0.015em]">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-6 text-[var(--l-ink-2)]">{s.body}</p>
              <div className="mt-8 flex min-h-20 items-center justify-center rounded-xl bg-[#f5f5f4] p-4">{s.demo}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function PlanCards({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto grid max-w-[800px] gap-4 text-left md:grid-cols-2">
      {PLAN_OPTIONS.map((plan) => {
        const hi = "highlighted" in plan && plan.highlighted;
        return (
          <div key={plan.name} className={cx("flex flex-col rounded-2xl p-6 md:p-8", hi ? "bg-[var(--l-ink)] text-white" : "bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.08)]")}>
            <h3 className="font-display text-[16px] font-semibold">{plan.name}</h3>
            <p className={cx("mt-1 text-[14px] leading-5", hi ? "text-white/65" : "text-[var(--l-ink-2)]")}>{plan.description}</p>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="font-display text-[40px] leading-none font-medium tracking-[-0.03em]">{plan.monthlyPrice}</span>
              <span className={cx("text-[13px]", hi ? "text-white/65" : "text-[var(--l-ink-3)]")}>{plan.priceNote}</span>
            </p>
            <ul className={cx("mt-6 flex flex-col gap-2.5 border-t pt-6 text-[14px] leading-5", hi ? "border-white/10" : "border-[var(--l-line)]")}>
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <RiCheckLine className={cx("mt-0.5 size-4 shrink-0", hi ? "text-[#7cc8fb]" : "text-[var(--l-blue)]")} />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-8 md:mt-auto md:pt-8">
              {hi ? (
                <a href={plan.button.url} className="l-btn l-btn-secondary h-11 w-full">{plan.button.text}</a>
              ) : (
                <button type="button" onClick={onStart} className="l-btn l-btn-primary h-11 w-full">{plan.button.text}</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Pricing({ onStart }: { onStart: () => void }) {
  return (
    <section id="pricing" className="scroll-mt-16 py-20 md:py-32">
      <div className={container}>
        <SectionHead eyebrow="Pricing" title="Free for small teams. Simple when you grow." body="Start without a card. Upgrade when the whole team reviews in Docks." />
        <PlanCards onStart={onStart} />
        <p className="mt-8 text-center text-[14px] text-[var(--l-ink-2)]">
          <a href="/pricing" className="font-medium text-[var(--l-ink)] underline decoration-[var(--l-line)] underline-offset-4 hover:decoration-current">Compare every feature</a>
        </p>
      </div>
    </section>
  );
}

export function Faq({ className }: { className?: string }) {
  return (
    <section id="faq" className={cx("scroll-mt-16 border-t border-[var(--l-line)] py-20 md:py-32", className)}>
      <div className={cx(container, "grid gap-10 md:grid-cols-[1fr_1.6fr] md:gap-16")}>
        <div>
          <h2 className="font-display text-[30px] leading-[36px] font-medium tracking-[-0.03em] md:text-[40px] md:leading-[44px]">Questions</h2>
          <p className="mt-4 text-[16px] leading-6 text-[var(--l-ink-2)]">
            Something else? <a href="mailto:devzshrcz@gmail.com" className="font-medium text-[var(--l-ink)] underline decoration-[var(--l-line)] underline-offset-4 hover:decoration-current">Email us</a>.
          </p>
        </div>
        <div className="divide-y divide-[var(--l-line)] border-y border-[var(--l-line)]">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-md text-[16px] leading-6 font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--l-blue)] [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="text-[20px] leading-none text-[var(--l-ink-3)] transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-[56ch] text-[15px] leading-6 text-[var(--l-ink-2)]">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ action }: { action: ReactNode }) {
  return (
    <section className="px-4 pb-4 sm:px-6 sm:pb-6">
      <div className="landing-sky-reverse mx-auto max-w-[1120px] rounded-3xl px-6 py-20 text-center md:py-28">
        <h2 className="font-display mx-auto max-w-[560px] text-[30px] leading-[36px] font-medium tracking-[-0.03em] text-balance md:text-[44px] md:leading-[48px]">
          Give every pull request a next step.
        </h2>
        <p className="mx-auto mt-4 max-w-[440px] text-[16px] leading-6 text-[var(--l-ink-2)]">Free for small teams. Set up in two minutes.</p>
        <div className="mt-8 flex justify-center">{action}</div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  const links = [
    { label: "Pricing", href: "/pricing" },
    { label: "Sign in", href: "/login" },
    { label: "Contact", href: "mailto:devzshrcz@gmail.com" },
  ];
  return (
    <footer className={cx(container, "flex flex-col items-start justify-between gap-6 py-10 text-[13px] text-[var(--l-ink-3)] sm:flex-row sm:items-center")}>
      <div className="flex items-center gap-2">
        <AppIcon className="size-5" />
        <span>© {new Date().getFullYear()} Docks</span>
      </div>
      <ul className="flex gap-6">
        {links.map((l) => (
          <li key={l.label}><a href={l.href} className="hover:text-[var(--l-ink)]">{l.label}</a></li>
        ))}
      </ul>
    </footer>
  );
}
