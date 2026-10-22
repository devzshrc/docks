"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Peep } from "@/components/landing/hero-orbit";
import { onFrame } from "@/components/landing/frame-loop";
import { ProductPreview, VIEWS, VOICES, type View } from "@/components/landing/product-preview";
import { cx } from "@/utils/cx";

/* After the hero, the product preview pins for four scroll steps, one per page. At each step the
 * reviewers who complained in the hero fly into that page (peep-trail.tsx follows the
 * `data-peep-anchor="story-N"` markers below), land on what fixes their problem, and say so.
 *
 * Scroll budget, in vh from the moment the stage pins: a short lead, then STEP per page. Step N's
 * reviewers are seated at FIRST + N × STEP; the page flips halfway through each flight. */

const LEAD = 40;
const STEP = 90;
const FIRST = LEAD - 5;
const HEIGHT = LEAD + STEP * VIEWS.length + 40;

const BEATS: { problem: string; fix: string }[] = [
  { problem: "Find the reviews waiting for you.", fix: "See review requests across your GitHub repositories. Start with the ones that have waited longest." },
  { problem: "Understand the code before you approve.", fix: "Read a summary, then follow a suggested order through the changed files." },
  { problem: "See where reviews slow down.", fix: "Track how long pull requests wait for a first review and how long they take to merge." },
  { problem: "See who can take the next review.", fix: "Check each teammate’s assigned reviews and workload before asking them to review more." },
];

export function StorySection() {
  const reduce = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const riseRef = useRef<HTMLDivElement>(null);
  const [story, setStory] = useState({ step: 0, landed: false, shown: false });

  useEffect(() => {
    const section = sectionRef.current;
    const bg = bgRef.current;
    const rise = riseRef.current;
    if (!section || !bg || !rise) return;
    if (reduce) {
      bg.style.opacity = "1";
      return;
    }
    let top = 0;
    let bottom = 0;
    let vh = 1;
    let pinned: boolean | null = null;
    let lastRise = -1;
    const smooth = (t: number) => t * t * (3 - 2 * t);
    return onFrame({
      read: () => {
        const r = section.getBoundingClientRect();
        top = r.top;
        bottom = r.bottom;
        vh = window.innerHeight;
      },
      write: () => {
        // Fully off screen: nothing to show, and the last visible frame already left the right state.
        if (top > vh || bottom < 0) return;
        // Pinned from top 0 on; until then the hero's own sky shows through.
        const now = top <= 0.5;
        if (now !== pinned) bg.style.opacity = (pinned = now) ? "1" : "0";

        // The preview rises while the hero docks its queue: starts 120vh out, done at 40vh.
        const v = smooth(Math.min(1, Math.max(0, (vh * 1.2 - top) / (vh * 0.8))));
        if (Math.abs(v - lastRise) > 5e-4) {
          lastRise = v;
          rise.style.transform = v >= 1 ? "none" : `translate3d(0, ${(1 - v) * 30}vh, 0) scale(${0.62 + 0.38 * v})`;
          rise.style.opacity = v >= 1 ? "1" : String(Math.max(0.001, Math.min(1, v * 1.35)));
          rise.style.willChange = v >= 1 || v <= 0 ? "auto" : "transform, opacity";
        }

        const y = (-top / vh) * 100;
        const step = Math.min(VIEWS.length - 1, Math.max(0, Math.floor((y - FIRST - STEP / 2) / STEP) + 1));
        const landed = y >= FIRST + step * STEP - 10;
        const shown = y > LEAD / 2;
        setStory((s) => (s.step === step && s.landed === landed && s.shown === shown ? s : { step, landed, shown }));
      },
    });
  }, [reduce]);

  const view = VIEWS[story.step]!.id;
  const pick = (v: View) => {
    const section = sectionRef.current;
    if (!section) return;
    const k = VIEWS.findIndex((x) => x.id === v);
    const top = section.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + ((FIRST + k * STEP) / 100) * window.innerHeight, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section id="problem" ref={sectionRef} className="relative scroll-mt-0" style={{ height: reduce ? undefined : `${HEIGHT}vh` }}>
      <div className={cx("h-svh min-h-[560px] w-full overflow-hidden", !reduce && "sticky top-0")}>
        <div ref={bgRef} aria-hidden="true" className="landing-sky absolute inset-0 opacity-0" />
        <div className="relative flex h-full flex-col items-center px-4 sm:px-6">
          <div className="grid h-[26svh] min-h-[150px] w-full max-w-[680px] max-sm:h-[32svh] items-end pb-5 text-center">
            {BEATS.map((b, k) => (
              <div
                key={b.problem}
                aria-hidden={k !== story.step}
                className={cx(
                  "col-start-1 row-start-1 transition-[opacity,transform] duration-300 ease-ui-out",
                  story.shown && k === story.step ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
                )}
              >
                <p className="mb-2 font-mono text-[12px] text-[var(--l-ink-3)] tabular-nums">
                  {String(k + 1).padStart(2, "0")} / {String(BEATS.length).padStart(2, "0")}
                </p>
                <h2 className="font-display text-[22px] leading-7 font-medium text-[var(--l-ink)] md:text-[28px] md:leading-9">
                  {b.problem}
                </h2>
                <p className="mt-1.5 text-[15px] leading-6 text-pretty text-[var(--l-ink-2)]">{b.fix}</p>
              </div>
            ))}
          </div>
          <div
            ref={riseRef}
            data-hero-rise
            className="w-full origin-top"
            style={{ ...(reduce ? {} : { opacity: 0.001, transform: "translate3d(0, 30vh, 0) scale(0.62)" }), maxWidth: "min(1120px, calc((100svh - max(26svh, 150px) - 76px) * 1.6))" }}>
            <ProductPreview view={view} story={story} onPick={pick} />
          </div>
          {/* Phones: the preview is too small to read, so the reviewers land here with their lines. */}
          <div className="mt-5 grid w-full max-w-[420px] sm:hidden">
            {VOICES.map((voices, k) => (
              <ul
                key={k}
                data-peep-for={`story-${k}`}
                className={cx("col-start-1 row-start-1 grid gap-2.5 transition-opacity duration-300 ease-ui-out",k === story.step ? "opacity-100" : "opacity-0")}
              >
                {voices.map(([face, says]) => (
                  <li key={face} className="flex items-center gap-2.5">
                    <Peep i={face} size={40} slot />
                    <span
                      className={cx(
                        "origin-left rounded-2xl rounded-bl-[5px] bg-[var(--l-raised)] px-3 py-1.5 text-[13px] leading-[18px] font-medium text-[var(--l-ink)] shadow-[0_0_0_1px_var(--l-line)] transition-[opacity,transform] duration-300 ease-ui-out",
                        k === story.step && story.landed ? "scale-100 opacity-100 delay-150" : "scale-90 opacity-0",
                      )}
                    >
                      {says}
                    </span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
      {!reduce &&
        VIEWS.map((v, k) => (
          // Trail markers: step k's reviewers are seated when this marker is mid-screen.
          <div
            key={v.id}
            aria-hidden="true"
            data-peep-anchor={`story-${k}`}
            data-peep-marker
            className="pointer-events-none absolute inset-x-0 h-0"
            style={{ top: `${FIRST + k * STEP + 50}vh` }}
          />
        ))}
    </section>
  );
}
