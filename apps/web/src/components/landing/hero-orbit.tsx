"use client";

import { RiGithubFill, RiSlackFill } from "@remixicon/react";
import { useReducedMotion } from "motion/react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

import { onFrame } from "@/components/landing/frame-loop";
import { cx } from "@/utils/cx";

/* The landing hero, told in three scroll beats inside one pinned stage:
 *   1. A ring of reviewers orbits the headline.
 *   2. The ring scatters, the problem writes itself on, and a few reviewers complain out loud.
 *   3. Everyone docks into one avatar row — the queue — just as the product preview rises under it.
 * One rAF loop writes transforms directly, so nothing re-renders while it plays. */

// Open Peeps sprite: 15 × 7 cells of 240 × 324.
const SPRITE = { src: "/landing/crowd-peeps.png", cols: 15, rows: 7 };
const TINTS = ["#dbeafe", "#fde68a", "#fbcfe8", "#bbf7d0", "#ddd6fe", "#fed7aa", "#a5f3fc", "#fecaca"];
// Hand-picked faces, never the knife-holders the crowd strip leaves out.
const CELLS = [8, 3, 27, 49, 13, 36, 66, 9, 51, 79, 23, 45, 64, 33, 59, 94];
export const FACES = CELLS.map((cell, i) => ({ cell, tint: TINTS[(i * 3) % TINTS.length]! }));

const PROBLEM = "A teammate asks for a review. The request gets lost in notifications. Days later, their code is still waiting.";
// What the scattered reviewers say, and which card says it on wide and narrow layouts.
const LINES = [
  "Can you review this? It’s been 3 days.",
  "Who is reviewing this?",
  "40 files. Where do I even start?",
  "I missed the review request.",
  "I thought it was your turn.",
  "What changed since my last review?",
];
const SPEAKERS = { wide: [0, 1, 5, 7, 10, 13], narrow: [1, 7, 10] };
const QUEUE_CAPTION = "Your GitHub reviews, in one place.";

/* Layout. */

const TOP_INSET = 90;
// Hero cards are drawn this tall and scaled by transform; larger than any size they reach.
const CARD = 150;
const isNarrow = (w: number, h: number) => Math.min(w, h) < 560 || w < 640;
const faceCount = (w: number, h: number) => (w < 1280 || isNarrow(w, h) ? 14 : 16);
const edge = (w: number) => (w >= 1280 ? 64 : w >= 600 ? 24 : 16);
const cardSize = (radius: number, narrow: boolean) => Math.max(44, Math.min(narrow ? 66 : 82, radius * 0.27));
// Phones: the widest ring whose cards still clear the screen edge (two fixed-point passes).
const narrowRadius = (w: number) => {
  const fit = (r: number) => (w / 2 - edge(w) - (cardSize(r, true) * 0.83) / 2) / 1.045;
  return fit(fit(w / 2));
};

/** The ring is an ellipse: wide on desktop so it clears the headline, tall on phones. */
function ring(w: number, h: number) {
  const narrow = isNarrow(w, h);
  const r = Math.min(narrow ? narrowRadius(w) : Math.min(w, h) * 0.345, Math.max(h / 2 - TOP_INSET - 30, 150));
  const size = cardSize(r, narrow);
  const rx = narrow ? r : Math.min(r * 1.55, w / 2 - edge(w) - (size * 0.83) / 2 - 8);
  const ry = narrow ? Math.max(r, Math.min(r * 1.3, h / 2 - TOP_INSET + 20 - size / 2)) : r;
  return { rx, ry, size, narrow };
}

/** Where card `index` sits on the slowly turning, gently breathing ring, as an angle and a radius scale. */
function orbit(index: number, count: number, seconds: number) {
  return {
    angle: (index / count) * Math.PI * 2 - Math.PI / 2 + seconds * 0.085,
    k: 1 + 0.035 * Math.sin(seconds * 1.35) + 0.01 * Math.sin(seconds * 0.45),
  };
}

// Scatter targets as fractions of the stage: x, y, size, opacity.
type Spot = [nx: number, ny: number, ns: number, opacity: number];
const SCATTER_WIDE: Spot[] = [
  [0.0717, 0.1457, 0.1426, 1], [0.8211, 0.167, 0.1296, 0.95], [0.6424, 0.2278, 0.0942, 0.8], [0.3283, 0.2346, 0.0824, 0.8],
  [0.484, 0.2028, 0.0589, 0.4], [0.9347, 0.4411, 0.1296, 1], [0.1235, 0.4997, 0.1154, 0.8], [0.2215, 0.7133, 0.0933, 0.8],
  [0.7097, 0.7411, 0.0942, 0.8], [0.434, 0.775, 0.0589, 0.4], [0.8343, 0.7614, 0.1296, 0.95], [0.5672, 0.8279, 0.0824, 0.6],
  [0.3503, 0.857, 0.0896, 0.6], [0.0503, 0.8981, 0.1296, 1], [0.6815, 0.9414, 0.1296, 1], [0.3017, 0.6941, 0.0589, 0.4],
];
const SCATTER_NARROW: Spot[] = [
  [0.1103, 0.1256, 0.0829, 1], [0.85, 0.1552, 0.0758, 0.95], [0.6423, 0.2186, 0.0557, 0.8], [0.3282, 0.2352, 0.0486, 0.8],
  [1.02, 0.4194, 0.0758, 1], [-0.02, 0.5006, 0.0675, 0.8], [0.2205, 0.7239, 0.0545, 0.8], [0.9372, 0.7506, 0.0841, 0.95],
  [0.35, 0.8299, 0.0533, 0.6], [0.641, 0.817, 0.0509, 0.6], [0.0654, 0.8749, 0.0818, 1], [0.8051, 0.9188, 0.0794, 1],
  [0.4833, 0.2938, 0.0355, 0.3], [0.8731, 0.282, 0.0427, 0.4], [0.6038, 0.7103, 0.0344, 0.4], [0.4372, 0.731, 0.0355, 0.4],
];

const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

function scatter(w: number, h: number, count: number) {
  const narrow = isNarrow(w, h);
  const spots = narrow ? SCATTER_NARROW : SCATTER_WIDE;
  const ref = narrow ? h : Math.min(h, w / 1.6);
  const minTop = narrow ? 56 : 100;
  return Array.from({ length: count }, (_, i) => {
    const [nx, ny, ns, opacity] = spots[i % spots.length]!;
    const seed = hash(i + 100);
    const size = Math.round(ns * ref);
    return { x: nx * w, y: Math.max(minTop + size / 2, ny * h), size, opacity, start: 0.03 + 0.3 * seed, bob: seed * Math.PI * 2 };
  });
}

/** The queue: one overlapping avatar row. It forms mid-stage, then rides the rising preview's top edge. */
function dock(w: number, h: number, count: number, previewTop: number) {
  const size = isNarrow(w, h) ? 34 : 46;
  const step = size * 0.72;
  const y = Math.max(64 + size / 2 + 18, Math.min(h * 0.42, previewTop - size / 2 - 44));
  return { size, y, x: (i: number) => w / 2 + (i - (count - 1) / 2) * step };
}

/* Easing. */

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const backOut = (t: number) => 1 + 2.1 * (t - 1) ** 3 + 1.1 * (t - 1) ** 2;
const ramp = (p: number, at: number, span: number) => smooth(clamp01((p - at) / span));
// Same curve as --ease-ui-out in globals.css; WAAPI needs the literal value.
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

// Scroll beats as fractions of the pinned scroll.
const BEATS = {
  wide: { meltEnd: 0.3, enterAt: 0.16, enterSpan: 0.08, writeAt: 0.18, writeSpan: 0.2, talkAt: 0.22, talkGap: 0.035, exitAt: 0.5, exitSpan: 0.07 },
  narrow: { meltEnd: 0.22, enterAt: 0.16, enterSpan: 0.06, writeAt: 0.18, writeSpan: 0.2, talkAt: 0.24, talkGap: 0.045, exitAt: 0.5, exitSpan: 0.07 },
};
const DOCK_AT = 0.6;
const DOCK_SPAN = 0.18;
const CAPTION_AT = 0.76;

const COPY_CLASS =
  "font-display text-[clamp(24px,4.2vmin,38px)] leading-[1.3] font-medium tracking-[-0.01em] text-balance text-[var(--l-ink)] max-[820px]:text-[22px] max-[820px]:leading-[1.4]";

/** The portrait, multiplied onto its tint inside its own box (background-blend, not mix-blend, so
 * moving tiles never blend against the page behind them). */
function Face({ cell, tint }: { cell: number; tint: string }) {
  const col = cell % SPRITE.cols;
  const row = Math.floor(cell / SPRITE.cols);
  return (
    <div
      className="absolute inset-x-0 top-[6%] aspect-[240/324]"
      style={{
        backgroundColor: tint,
        backgroundBlendMode: "multiply",
        backgroundImage: `url(${SPRITE.src})`,
        backgroundSize: `${SPRITE.cols * 100}% ${SPRITE.rows * 100}%`,
        backgroundPosition: `${(col / (SPRITE.cols - 1)) * 100}% ${(row / (SPRITE.rows - 1)) * 100}%`,
      }}
    />
  );
}

/** One reviewer from the hero, as a small tinted portrait tile, so later sections reuse the same cast. */
export function Peep({ i, size = 40, slot, className }: { i: number; size?: number; slot?: boolean; className?: string }) {
  const face = FACES[i % FACES.length]!;
  return (
    <span
      aria-hidden="true"
      data-peep-slot={slot ? i : undefined}
      className={cx("relative inline-block shrink-0 overflow-hidden shadow-[0_1px_2px_rgb(38_37_35/0.08),0_4px_12px_rgb(38_37_35/0.08)] outline-1 -outline-offset-1 outline-black/5", className)}
      style={{ width: size * 0.83, height: size, borderRadius: size * 0.16, backgroundColor: face.tint }}
    >
      <Face cell={face.cell} tint={face.tint} />
    </span>
  );
}

function WorksWith({ className }: { className?: string }) {
  return (
    <div className={cx("flex items-center gap-3 text-[14px] text-[var(--l-ink-3)] [&_svg]:size-5", className)}>
      <span>Works with</span>
      <RiGithubFill className="text-[var(--l-ink)]" />
      <RiSlackFill className="text-[var(--l-ink)]" />
    </div>
  );
}

export function HeroOrbit({ headline, description, actions }: { headline: ReactNode; description: string; actions: ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLParagraphElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const bubbles = useRef<(HTMLDivElement | null)[]>([]);
  const introDone = useRef(false);
  const [count, setCount] = useState(16);

  useEffect(() => {
    const measure = () => {
      const stage = stageRef.current;
      if (stage) setCount(faceCount(stage.clientWidth, stage.clientHeight));
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const section = sectionRef.current;
    const head = headRef.current;
    const foot = footRef.current;
    const els = cards.current.slice(0, count);
    if (!stage || !section || !head || !foot || els.some((el) => !el)) return;
    const nodes = els as HTMLDivElement[];
    const pos = nodes.map(() => ({ x: 0, y: 0, size: 0 }));
    const scales = nodes.map(() => 1);
    const shownAt = nodes.map(() => "");

    // Cards stay CARD px tall and scale by transform, so moving them never triggers layout.
    const place = (i: number, x: number, y: number, size: number) => {
      nodes[i]!.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${((size / CARD) * scales[i]!).toFixed(4)})`;
      pos[i] = { x, y, size };
    };
    const fade = (i: number, v: number) => {
      const next = v.toFixed(3);
      if (shownAt[i] !== next) nodes[i]!.style.opacity = shownAt[i] = next;
    };

    if (reduce) {
      const still = () => {
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        const { rx, ry, size } = ring(w, h);
        nodes.forEach((_, i) => {
          const a = (i / count) * Math.PI * 2 - Math.PI / 2;
          fade(i, 1);
          place(i, w / 2 + Math.cos(a) * rx, h / 2 + Math.sin(a) * ry, size);
        });
      };
      head.style.opacity = "1";
      foot.style.opacity = "1";
      still();
      window.addEventListener("resize", still, { passive: true });
      return () => window.removeEventListener("resize", still);
    }

    const copy = copyRef.current;
    const caption = captionRef.current;
    if (!copy || !caption) return;
    const chars = Array.from(copy.querySelectorAll<HTMLElement>("[data-ch]"));
    const talk = bubbles.current.filter((el): el is HTMLDivElement => el !== null);
    const preview = document.querySelector<HTMLElement>("[data-hero-rise]");

    let disposed = false;
    let t0: number | null = null;
    let intro = !introDone.current;
    let cardsFrom: number | null = null;
    let spots = scatter(1, 1, count);
    let lastW = 0;
    let lastH = 0;
    let lit = -1;
    const timers: number[] = [];
    const anims: Animation[] = [];
    let headAnim: Animation | null = null;

    // Measured in the read phase, used in the write phase.
    let w = 0;
    let h = 0;
    let stageLeft = 0;
    let stageTop = 0;
    let previewTop = Infinity;
    let p = 0;
    let onScreen = true;
    let settled = false;

    const settle = (el: HTMLElement) => {
      el.style.opacity = "1";
      el.style.transform = "none";
      el.style.filter = "none";
    };

    const finishIntro = (animate: boolean) => {
      intro = false;
      introDone.current = true;
      headAnim?.cancel();
      headAnim = null;
      settle(head);
      if (!animate) return settle(foot);
      const a = foot.animate(
        [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 620, easing: EASE_OUT, fill: "forwards" },
      );
      anims.push(a);
      a.finished.then(() => (settle(foot), a.cancel()), () => {});
    };

    /** Pins each speech bubble beside its speaker's upper corner, on the side facing the middle. */
    const speak = (beats: typeof BEATS.wide, speakers: number[], gone: number) => {
      talk.forEach((el, b) => {
        const who = speakers[b];
        const at = pos[who ?? -1];
        const k = who === undefined || !at ? 0 : ramp(p, beats.talkAt + b * beats.talkGap, 0.03) * (1 - gone);
        if (k <= 0.001 || !at) {
          if (el.style.opacity !== "0") el.style.opacity = "0";
          return;
        }
        const left = at.x > w / 2;
        const gap = (at.size * 0.83) / 2 + 10;
        el.dataset.side = left ? "left" : "right";
        el.style.opacity = k.toFixed(3);
        el.style.transform = `translate3d(${at.x + (left ? -gap : gap)}px, ${at.y - at.size * 0.08}px, 0) translate(${left ? "-100%" : "0"}, -100%) scale(${0.88 + 0.12 * k})`;
      });
    };

    // Pointer proximity: cards swell as the cursor nears, the nearest one lifts.
    let px = -1e4;
    let py = -1e4;
    let hovered: HTMLElement | null = null;
    const hover = () => {
      let nearest: HTMLElement | null = null;
      let best = 1e9;
      for (let i = 0; i < nodes.length; i++) {
        const d = shownAt[i] === "0.000" ? 1e9 : Math.hypot(px - pos[i]!.x, py - pos[i]!.y);
        const target = d < 640 ? 1 + 0.2 * smooth(1 - d / 640) : 1;
        if (d < best) {
          best = d;
          nearest = nodes[i]!;
        }
        scales[i] = scales[i]! + (target - scales[i]!) * 0.14;
      }
      const pick = best < 88 ? nearest : null;
      if (pick !== hovered) {
        if (hovered) hovered.dataset.hovered = "false";
        hovered = pick;
        if (pick) pick.dataset.hovered = "true";
      }
    };

    const read = () => {
      const vh = window.innerHeight;
      const sr = section.getBoundingClientRect();
      onScreen = sr.bottom > 0 && sr.top < vh;
      if (!onScreen) return;
      w = stage.clientWidth;
      h = stage.clientHeight;
      const rect = stage.getBoundingClientRect();
      stageLeft = rect.left;
      stageTop = rect.top;
      previewTop = preview ? preview.getBoundingClientRect().top - stageTop : Infinity;
      const travel = section.offsetHeight - vh;
      p = travel <= 0 ? 0 : clamp01(-sr.top / travel);
    };

    const write = (now: number) => {
      t0 ??= now;
      // Off screen, or docked and handed to the trail: nothing left to move.
      if (!onScreen || (settled && p >= 1 && !intro)) return;
      settled = p >= 1;
      const seconds = (now - t0) / 1000;
      const cx0 = w / 2;
      const cy0 = h / 2;
      const { rx, ry, size: ringSize, narrow } = ring(w, h);
      if (w !== lastW || h !== lastH) {
        spots = scatter(w, h, count);
        lastW = w;
        lastH = h;
      }
      const queue = dock(w, h, count, previewTop);
      const beats = narrow ? BEATS.narrow : BEATS.wide;
      const enter = ramp(p, beats.enterAt, beats.enterSpan);
      const exit = ramp(p, beats.exitAt, beats.exitSpan);
      const shown = enter * (1 - exit);

      if (intro && p > 0.001) finishIntro(false);
      const since = cardsFrom === null ? -1 : now - cardsFrom;
      let moving = false;
      hover();

      for (let i = 0; i < count; i++) {
        const spot = spots[i]!;
        const o = orbit(i, count, seconds);
        const ox = cx0 + Math.cos(o.angle) * rx * o.k;
        const oy = cy0 + Math.sin(o.angle) * ry * o.k;

        if (intro) {
          // Spiral in one after another, overshooting into place.
          const t = clamp01((since - i * 44) / 950);
          if (t < 1) moving = true;
          if (t <= 0) {
            fade(i, 0);
            continue;
          }
          const e = backOut(t);
          const a = o.angle - 0.55 * (1 - e);
          const s = o.k * (0.86 + 0.14 * e);
          fade(i, Math.min(1, t * 2.5));
          place(i, cx0 + Math.cos(a) * rx * s, cy0 + Math.sin(a) * ry * s, ringSize * (0.55 + 0.45 * e));
          continue;
        }

        if (p <= 0.001) {
          fade(i, 1);
          place(i, ox, oy, ringSize);
          continue;
        }

        // Melt from the ring into the scatter...
        const lag = spot.start * 0.35;
        const m = smooth(clamp01((Math.min(1, p / beats.meltEnd) - lag) / (1 - lag)));
        // ...then dock into the queue, left to right.
        const d = smoother(clamp01((p - DOCK_AT - (i / count) * 0.06) / DOCK_SPAN));
        const sx = ox + (spot.x - ox) * m;
        const sy = oy + (spot.y - oy) * m + Math.sin(seconds * 0.6 + spot.bob) * 4 * m * (1 - d);
        const ss = ringSize + (spot.size - ringSize) * m;
        let opacity = 1 + (spot.opacity - 1) * m;
        if (shown > 0 && narrow) {
          // Phones: dim the cards behind the copy so it stays readable.
          const near = clamp01(1 - Math.hypot((sx - cx0) / 190, (sy - cy0) / 175));
          opacity *= 1 - 0.72 * near * shown;
        }
        fade(i, opacity + (1 - opacity) * d);
        place(i, sx + (queue.x(i) - sx) * d, sy + (queue.y - sy) * d, Math.max(18, ss + (queue.size - ss) * d));
      }

      if (intro) {
        if (cardsFrom !== null && !moving) finishIntro(true);
        return;
      }

      const out = Math.min(1, p / 0.14);
      head.style.opacity = String(1 - out);
      head.style.transform = `translate3d(0, ${-out * 36}px, 0) scale(${1 - out * 0.04})`;
      foot.style.opacity = String(1 - out);
      copy.style.opacity = shown.toFixed(3);
      copy.style.transform = `translate(-50%, -50%) translate3d(0, ${(1 - enter) * 34 - exit * 44}px, 0)`;
      const on = Math.round(clamp01((p - beats.writeAt) / beats.writeSpan) * chars.length);
      if (on !== lit) {
        lit = on;
        chars.forEach((ch, i) => (ch.dataset.on = i < on ? "true" : "false"));
      }
      speak(beats, narrow ? SPEAKERS.narrow : SPEAKERS.wide, exit);
      const c = ramp(p, CAPTION_AT, 0.07);
      caption.style.opacity = c.toFixed(3);
      caption.style.transform = `translate3d(-50%, ${queue.y + queue.size / 2 + 14 + (1 - c) * 8}px, 0)`;
    };

    const onMove = (e: PointerEvent) => {
      px = e.clientX - stageLeft;
      py = e.clientY - stageTop;
    };
    const onLeave = () => {
      px = py = -1e4;
    };

    const wait = (ms: number) => new Promise<void>((done) => timers.push(window.setTimeout(done, ms)));
    const play = async () => {
      await new Promise<void>((done) => {
        const img = new Image();
        img.onload = img.onerror = () => done();
        img.src = SPRITE.src;
      });
      if (disposed || !intro) return;
      headAnim = head.animate(
        [
          { opacity: 0, transform: "translateY(26px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 1650, delay: 300, easing: EASE_OUT, fill: "forwards" },
      );
      headAnim.finished.then((a) => (settle(head), a.cancel()), () => {});
      await wait(1150);
      if (!disposed && intro) cardsFrom = performance.now();
    };

    const stop = onFrame({ read, write });
    if (intro) void play();
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      disposed = true;
      stop();
      timers.forEach((t) => window.clearTimeout(t));
      headAnim?.cancel();
      anims.forEach((a) => a.cancel());
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [count, reduce]);

  return (
    <section ref={sectionRef} data-peep-anchor="hero" className={cx("relative isolate", !reduce && "h-[340vh]")}>
      <div ref={stageRef} className={cx("landing-sky h-svh min-h-[520px] w-full overflow-hidden", reduce ? "relative" : "sticky top-0")}>
        <div aria-hidden="true" className="absolute inset-0">
          {FACES.slice(0, count).map((face, i) => (
            <div
              key={face.cell}
              ref={(el) => {
                cards.current[i] = el;
              }}
              data-peep-slot={i}
              data-hero-card
              className="absolute top-0 left-0 overflow-hidden opacity-0 shadow-[0_1px_2px_rgb(38_37_35/0.08),0_6px_18px_rgb(38_37_35/0.07)] outline-1 -outline-offset-1 outline-black/5 [backface-visibility:hidden] [will-change:transform,opacity] data-[hovered=true]:z-20"
              style={{ backgroundColor: face.tint, width: CARD * 0.83, height: CARD, borderRadius: CARD * 0.113 }}
            >
              <Face cell={face.cell} tint={face.tint} />
            </div>
          ))}
        </div>

        {!reduce && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
            {LINES.map((line, b) => (
              <div
                key={line}
                ref={(el) => {
                  bubbles.current[b] = el;
                }}
                data-side="right"
                className="absolute top-0 left-0 rounded-2xl whitespace-nowrap bg-[var(--l-raised)] px-3.5 py-2 text-[13px] leading-[18px] font-medium text-[var(--l-ink)] opacity-0 shadow-[0_1px_2px_rgb(15_23_42/0.06),0_8px_24px_-6px_rgb(15_23_42/0.18)] ring-1 ring-[var(--l-line)] [will-change:transform,opacity] data-[side=left]:origin-bottom-right data-[side=left]:rounded-br-[5px] data-[side=right]:origin-bottom-left data-[side=right]:rounded-bl-[5px] max-[820px]:max-w-[160px] max-[820px]:whitespace-normal max-[820px]:text-[12px] max-[820px]:leading-4"
              >
                {line}
              </div>
            ))}
          </div>
        )}

        <div className="pointer-events-none absolute top-1/2 left-1/2 z-30 w-[min(62vmin,92vw)] -translate-x-1/2 -translate-y-1/2 text-center max-[820px]:w-[min(60vw,250px)]">
          <div ref={headRef} className={cx("antialiased [will-change:opacity,transform]", !reduce && "opacity-0")}>
            <h1 className="font-display text-[clamp(28px,5.4vmin,54px)] leading-[1.1] font-medium tracking-[-0.025em] text-balance text-[var(--l-ink)] max-[820px]:text-[24px]">
              {headline}
            </h1>
            <p className="mt-4 text-body-regular text-[var(--l-ink-2)] max-[820px]:text-body-2-regular">
              {description}
            </p>
            <div className="pointer-events-auto mt-7 max-[820px]:mt-4">{actions}</div>
          </div>
        </div>

        <div ref={footRef} className={cx("absolute right-8 bottom-7 z-20 max-[820px]:inset-x-0 max-[820px]:bottom-8 max-[820px]:flex max-[820px]:justify-center", !reduce && "opacity-0")}>
          <WorksWith />
        </div>

        {!reduce && (
          <>
            <p
              ref={copyRef}
              className={cx("pointer-events-none absolute top-1/2 left-1/2 z-30 w-[min(720px,86vw)] text-center opacity-0 [transform:translate(-50%,-50%)] [will-change:opacity,transform] max-[820px]:w-[78%]", COPY_CLASS)}
            >
              <span className="sr-only">{PROBLEM}</span>
              <span aria-hidden="true">
                {PROBLEM.split(" ").map((word, w) => (
                  <Fragment key={`${word}-${w}`}>
                    {w === 0 ? null : " "}
                    <span className="inline-block whitespace-pre">
                      {[...word].map((ch, c) => (
                        <span key={c} data-ch data-on="false" className="opacity-[0.13] transition-opacity duration-[180ms] ease-ui-out data-[on=true]:opacity-100">
                          {ch}
                        </span>
                      ))}
                    </span>
                  </Fragment>
                ))}
              </span>
            </p>
            <p
              ref={captionRef}
              className="pointer-events-none absolute top-0 left-1/2 z-30 text-[14px] font-medium whitespace-nowrap text-[var(--l-ink-2)] opacity-0 [will-change:opacity,transform]"
            >
              {QUEUE_CAPTION}
            </p>
          </>
        )}
      </div>
      {reduce && (
        <div className="flex justify-center bg-[var(--l-bg)] px-6 py-28">
          <p className={cx("max-w-[720px] text-center", COPY_CLASS)}>{PROBLEM}</p>
        </div>
      )}
    </section>
  );
}

/** Lays what follows the hero over its last screen, so the story's preview (which rises in by
 * itself, see story.tsx) lands under the docked queue exactly as the hero unpins. */
export function HeroRise({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <div className="relative z-10" style={reduce ? undefined : { marginTop: "-100svh" }}>
      {children}
    </div>
  );
}
