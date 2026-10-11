"use client";

import { RiCheckLine, RiGithubFill } from "@remixicon/react";
import { useEffect, useRef, type ReactNode } from "react";
import { AppIcon } from "@/components/app-icon";
import { FAQ } from "@/components/marketing/plans";
import { PLAN_OPTIONS } from "@/components/landing/plan-options";
import { cx } from "@/utils/cx";

export const container = "mx-auto w-full max-w-[1120px] px-4 sm:px-6";

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="mx-auto mb-12 max-w-[640px] text-center md:mb-16">
      <p className="mb-3 text-[13px] font-medium text-[var(--l-blue)]">{eyebrow}</p>
      <h2 className="font-display text-[30px] leading-[36px] font-medium text-balance md:text-[40px] md:leading-[44px]">
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
              <h3 className="font-display mt-6 text-[18px] leading-6 font-semibold">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-6 text-[var(--l-ink-2)]">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* How it works: each step has a small looping animation (CSS, see .hiw-* in globals.css) that plays only while on screen. */
function ConnectVisual() {
  return (
    <div className="relative flex h-full items-center justify-center gap-0">
      <span className="hiw-pop grid size-11 place-items-center rounded-xl bg-[#0b0b0c] text-white shadow-[0_6px_14px_-6px_rgb(0_0_0/0.5)]">
        <RiGithubFill className="size-6" />
      </span>
      <span className="relative mx-3 h-px w-20 bg-[repeating-linear-gradient(90deg,rgb(11_11_12/0.25)_0_4px,transparent_4px_8px)]">
        <span className="hiw-travel absolute -top-[3px] left-0 size-[7px] rounded-full bg-[var(--l-blue)] shadow-[0_0_0_3px_rgb(47_123_245/0.2)]" />
      </span>
      <span className="hiw-pop grid size-11 place-items-center [animation-delay:300ms]">
        <AppIcon className="size-11" />
      </span>
      <div className="absolute inset-x-0 bottom-5 flex justify-center gap-1.5">
        {["acme/api", "acme/web", "acme/infra"].map((r, i) => (
          <span key={r} className="hiw-chip rounded-full bg-white px-2 py-0.5 font-mono text-[10.5px] text-[var(--l-ink-2)] shadow-[0_0_0_1px_rgb(0_0_0/0.07)]" style={{ animationDelay: `${900 + i * 180}ms` }}>
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}

function QueueVisual() {
  const rows = [
    { t: "Rate-limit login", w: "26h", c: "#f59e0b" },
    { t: "Billing to RSC", w: "4h", c: "#2f7bf5" },
    { t: "Pin Postgres", w: "1h", c: "#10b981" },
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 px-6">
      {rows.map((r, i) => (
        <div
          key={r.t}
          className={cx("hiw-row flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-[11.5px] shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.04)]", i === 0 && "hiw-first")}
          style={{ animationDelay: `${i * 140}ms` }}
        >
          <span className="size-1.5 rounded-full" style={{ background: r.c }} />
          <span className="flex-1 truncate font-medium">{r.t}</span>
          <span className="text-[10.5px] text-[var(--l-ink-3)] tabular-nums">{r.w}</span>
        </div>
      ))}
    </div>
  );
}

function PostVisual() {
  return (
    <div className="relative flex h-full items-center justify-center gap-10">
      <span className="hiw-press inline-flex items-center gap-1.5 rounded-full bg-[var(--l-blue)] px-3.5 py-2 text-[12px] font-medium text-white shadow-[0_6px_14px_-6px_rgb(47_123_245/0.7)]">
        <RiCheckLine className="size-3.5" />
        Approve
      </span>
      <span className="relative grid size-11 place-items-center rounded-xl bg-[#0b0b0c] text-white">
        <RiGithubFill className="size-6" />
        <span className="hiw-ping absolute inset-0 rounded-xl ring-2 ring-[#16a34a]" />
        <span className="hiw-badge absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-[#16a34a] text-white ring-2 ring-white">
          <RiCheckLine className="size-3" />
        </span>
      </span>
      <span className="hiw-fly pointer-events-none absolute top-1/2 left-1/2 -mt-2.5 -ml-[66px] grid size-5 place-items-center rounded-full bg-[#16a34a] text-white">
        <RiCheckLine className="size-3" />
      </span>
    </div>
  );
}

const STEPS = [
  { title: "Connect GitHub", body: "Sign in with GitHub and choose repositories. Nothing to install in your code.", visual: <ConnectVisual /> },
  { title: "Get one queue", body: "Pull requests that need you, sorted by who has waited longest.", visual: <QueueVisual /> },
  { title: "Review and post back", body: "Follow the guided path. Comments and approvals land on GitHub.", visual: <PostVisual /> },
];

/** Adds .is-live while the element is on screen, so its CSS loops only run when seen. */
function useLive<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => el.classList.toggle("is-live", e!.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export function HowItWorks() {
  const live = useLive<HTMLOListElement>();
  return (
    <section id="how" className="scroll-mt-16 bg-[#fafafa] py-20 md:py-32">
      <div className={container}>
        <SectionHead eyebrow="How it works" title="From sign-in to first review in two minutes." body="Docks sits on top of GitHub. Your history, branches and permissions stay where they are." />
        <ol ref={live} className="hiw relative grid gap-4 md:grid-cols-3 md:gap-5">
          {/* Progress line joining the three numbers on wide screens. */}
          <span aria-hidden className="absolute top-[13px] right-[16.6%] left-[16.6%] hidden h-px bg-[var(--l-line)] md:block">
            <span className="hiw-line absolute inset-0 origin-left bg-[var(--l-blue)]/50" />
          </span>
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative grid grid-rows-[auto_auto_1fr] justify-items-center gap-0 text-center">
              <span className="relative z-[1] grid size-7 place-items-center rounded-full bg-[var(--l-ink)] font-mono text-[12px] text-white ring-4 ring-[#fafafa]">{i + 1}</span>
              <div className="mt-5 h-[168px] w-full overflow-hidden rounded-2xl bg-white text-left shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.03),0_12px_28px_-18px_rgb(15_23_42/0.18)]">{s.visual}</div>
              <div className="mt-5 max-w-[300px]">
                <h3 className="font-display text-[18px] leading-6 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-[15px] leading-6 text-pretty text-[var(--l-ink-2)]">{s.body}</p>
              </div>
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
              <span className="font-display text-[40px] leading-none font-medium">{plan.monthlyPrice}</span>
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
          <h2 className="font-display text-[30px] leading-[36px] font-medium md:text-[40px] md:leading-[44px]">Questions</h2>
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
        <h2 className="font-display mx-auto max-w-[560px] text-[30px] leading-[36px] font-medium text-balance md:text-[44px] md:leading-[48px]">
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
