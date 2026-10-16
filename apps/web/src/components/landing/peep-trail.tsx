"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import { onFrame } from "@/components/landing/frame-loop";
import { FACES, Peep } from "@/components/landing/hero-orbit";

/* The hero's reviewers keep travelling with the reader, all the way down to pricing.
 *
 * Sections mark landing spots: an element with `data-peep-anchor`, holding elements with
 * `data-peep-slot="<face index>"`. While live, those slots go invisible (see globals.css) and one
 * fixed layer of 16 tiles flies between them. Each hop runs in document space: a tile sits on its
 * slot (scrolling with the content), lifts off part-way to the next anchor, arcs, and lands on its
 * next slot. Faces with no slot in an anchor fold into one that has one, faded out.
 *
 * Slots can also live outside their anchor, under `data-peep-for="<anchor>"` — the pinned story
 * preview does this. Such an anchor carries `data-peep-marker`: it is a zero-height marker whose
 * position, not its slots', sets when the reviewers are seated. */

const BASE = 60;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const hash = (n: number) => {
  const v = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return v - Math.floor(v);
};

type Spot = { x: number; y: number; h: number; shown: boolean };

type Anchor = { el: HTMLElement; marker: boolean; seats: [number, HTMLElement][] };

/** Finds every anchor and its seats. Cheap, but done only on mount and resize, never per frame. */
function collect(): Anchor[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-peep-anchor]")).map((el) => {
    const linked = document.querySelectorAll<HTMLElement>(`[data-peep-for="${el.dataset.peepAnchor}"] [data-peep-slot]`);
    const seats = [...el.querySelectorAll<HTMLElement>("[data-peep-slot]"), ...linked].map((seat) => [Number(seat.dataset.peepSlot), seat] as [number, HTMLElement]);
    return { el, marker: "peepMarker" in el.dataset, seats };
  });
}

function measure(anchor: Anchor, scrollY: number) {
  const spots = new Map<number, Spot>();
  for (const [i, el] of anchor.seats) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) spots.set(i, { x: r.left + r.width / 2, y: r.top + r.height / 2 + scrollY, h: r.height, shown: true });
  }
  return [...spots.entries()];
}

function spotFor(spots: [number, Spot][], i: number): Spot | null {
  const own = spots.find(([k]) => k === i);
  if (own) return own[1];
  const host = spots[i % Math.max(1, spots.length)];
  return host ? { ...host[1], shown: false } : null;
}

export function PeepTrail() {
  const reduce = useReducedMotion() ?? false;
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = layer.current;
    if (reduce || !box) return;
    const root = document.documentElement;
    root.dataset.peepsLive = "";
    const tiles = Array.from(box.children) as HTMLElement[];
    const last = tiles.map(() => ({ t: "", o: "" }));
    let anchors = collect();
    const refresh = () => (anchors = collect());
    // Hero card count changes with the viewport; re-collect after resizes and once things settle.
    window.addEventListener("resize", refresh, { passive: true });
    const late = window.setTimeout(refresh, 1200);

    let handed = false;
    let plan: { t: string; o: string }[] | null = null;

    const read = () => {
      plan = null;
      const hero = anchors[0];
      if (!hero) return;
      const s = window.scrollY;
      const vh = window.innerHeight;
      // The hero hands over once its stage unpins, with the queue docked.
      const handoff = hero.el.getBoundingClientRect().top + s + hero.el.offsetHeight - vh;
      if (s < handoff - 0.5) return;

      const stops = anchors.map((a, k) => {
        const spots = measure(a, s);
        const mid = a.marker
          ? a.el.getBoundingClientRect().top + s
          : spots.length
            ? spots.reduce((sum, [, p]) => sum + p.y, 0) / spots.length
            : 0;
        return { spots, focus: k === 0 ? handoff : mid - vh * 0.5 };
      });
      let k = 0;
      while (k < stops.length - 1 && stops[k + 1]!.focus <= s) k++;
      const from = stops[k]!;
      const to = stops[k + 1];
      const t = to ? clamp01((s - from.focus) / Math.max(1, to.focus - from.focus)) : 0;

      plan = tiles.map((_, i) => {
        const a = spotFor(from.spots, i);
        const b = to ? spotFor(to.spots, i) : a;
        if (!a || !b) return { t: "", o: "0" };
        // Ride the section until it is mostly read, then fly late and quick (a beat later for each
        // face), arcing sideways, so landings meet the next slots as they reach mid-screen.
        const e = ease(clamp01((t - 0.42 - (i / tiles.length) * 0.1) / 0.42));
        const swing = Math.sin(Math.PI * e) * (hash(i) - 0.5) * 180;
        const x = a.x + (b.x - a.x) * e + swing;
        const y = a.y + (b.y - a.y) * e - s;
        const h = a.h + (b.h - a.h) * e;
        const lift = 1 + Math.sin(Math.PI * e) * 0.12;
        // Faces without a seat in the next section bow out early; faces gaining one fade in on landing.
        const out = a.shown ? 1 - clamp01(e * 2.5) : 0;
        const inn = b.shown ? clamp01((e - 0.55) / 0.45) : 0;
        const o = a.shown && b.shown ? 1 : Math.max(out, inn);
        return {
          t: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${((h / BASE) * lift).toFixed(4)})`,
          o: o.toFixed(3),
        };
      });
    };

    const write = () => {
      if (!plan) {
        if (handed) {
          handed = false;
          delete root.dataset.peepsHanded;
          box.style.opacity = "0";
        }
        return;
      }
      if (!handed) {
        handed = true;
        root.dataset.peepsHanded = "";
        box.style.opacity = "1";
      }
      plan.forEach((next, i) => {
        const tile = tiles[i]!;
        const prev = last[i]!;
        if (next.o !== prev.o) tile.style.opacity = prev.o = next.o;
        if (next.t && next.t !== prev.t) tile.style.transform = prev.t = next.t;
      });
    };

    const stop = onFrame({ read, write });
    return () => {
      stop();
      window.clearTimeout(late);
      window.removeEventListener("resize", refresh);
      delete root.dataset.peepsLive;
      delete root.dataset.peepsHanded;
    };
  }, [reduce]);

  if (reduce) return null;
  return (
    <div ref={layer} aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 opacity-0">
      {FACES.map((face, i) => (
        <div key={face.cell} className="absolute top-0 left-0 opacity-0 [will-change:transform,opacity]">
          <Peep i={i} size={BASE} />
        </div>
      ))}
    </div>
  );
}
