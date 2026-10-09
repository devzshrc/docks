"use client";

import { gsap } from "gsap";
import { useEffect, useRef, type ReactNode } from "react";

import { cx } from "@/utils/cx";

/** A named person in the crowd: wears a name tag and speaks a line. */
export type CrowdCastMember = {
  /** Sprite cell index, counted left to right, top to bottom. */
  cell: number;
  name: string;
  line: string;
  /** Shows the speaker as on a phone call. */
  call?: boolean;
  /** Optional individual portrait in place of the shared sprite cell. */
  imageSrc?: string;
  /** Always included, with extra chances to speak. */
  featured?: boolean;
};

interface CrowdCanvasProps {
  src: string;
  /** Sprite cells across the image, matching the supplied Skiper sprite. */
  rows?: number;
  /** Sprite cells down the image. */
  cols?: number;
  cast?: readonly CrowdCastMember[];
  /** Sprite cells to leave out of the crowd. */
  exclude?: readonly number[];
  className?: string;
}

type Peep = {
  sourceX: number;
  sourceY: number;
  x: number;
  y: number;
  anchorY: number;
  scaleX: number;
  speed: number;
  sway: number;
  walk: gsap.core.Timeline | null;
  cast?: CrowdCastMember;
  speech?: { start: number; end: number };
};

const NO_CAST: readonly CrowdCastMember[] = [];
const NO_CELLS: readonly number[] = [];
const SPEECH_SECONDS = 5.5;

/**
 * Adapted from Skiper UI's Skiper 39 (https://skiper-ui.com/).
 * Inspired by https://codepen.io/zadvorsky/pen/xxwbBQV.
 * Illustrations by Open Peeps (https://www.openpeeps.com/).
 * Original component author: @gurvinder-singh02, https://gxuri.me.
 */
export function CrowdCanvas({
  src,
  rows = 15,
  cols = 7,
  cast = NO_CAST,
  exclude = NO_CELLS,
  className,
}: CrowdCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (
      !canvas ||
      !ctx ||
      !Number.isInteger(rows) ||
      !Number.isInteger(cols) ||
      rows < 1 ||
      cols < 1
    )
      return;

    const img = new Image();
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const castByCell = new Map(cast.map((member) => [member.cell, member]));
    const portraits = new Map<number, HTMLImageElement>();
    const skipped = new Set(exclude);
    const stage = { width: 0, height: 0 };
    let disposed = false;
    let loaded = false;
    let visible = true;
    let ticking = false;
    let sourceWidth = 0;
    let sourceHeight = 0;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let fontFamily = "sans-serif";
    let hovered: Peep | null = null;
    let nextSpeechAt = 0;
    const crowd: Peep[] = [];
    const randomRange = (min: number, max: number) =>
      min + Math.random() * (max - min);
    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), max);
    const now = () => performance.now() / 1000;
    const playing = () =>
      loaded && visible && !document.hidden && !motionPreference.matches;
    const bodyLeft = (peep: Peep) =>
      peep.scaleX === 1 ? peep.x : peep.x - width;
    const centerX = (peep: Peep) => bodyLeft(peep) + width / 2;

    const startSpeech = (peep: Peep, start: number, seconds: number) => {
      peep.speech = { start, end: start + seconds };
      if (peep.walk)
        gsap.to(peep.walk, { timeScale: peep.speed * 0.65, duration: 0.6 });
    };

    const endSpeech = (peep: Peep) => {
      peep.speech = undefined;
      if (peep.walk)
        gsap.to(peep.walk, { timeScale: peep.speed, duration: 0.8 });
    };

    const speechAlpha = (peep: Peep, time: number) => {
      if (peep === hovered) return 1;
      if (!peep.speech) return 0;
      if (time >= peep.speech.end) {
        endSpeech(peep);
        return 0;
      }
      return clamp(
        Math.min(
          (time - peep.speech.start) / 0.25,
          (peep.speech.end - time) / 0.35,
        ),
        0,
        1,
      );
    };

    const speakNext = (time: number) => {
      if (hovered) return;
      const speaking = crowd.filter((peep) => peep.speech || peep === hovered);
      const limit = stage.width < 640 ? 1 : 2;
      if (speaking.length >= limit) return;
      const candidates = crowd.filter(
        (peep) =>
          peep.cast &&
          !peep.speech &&
          peep !== hovered &&
          centerX(peep) > stage.width * 0.12 &&
          centerX(peep) < stage.width * 0.88 &&
          speaking.every(
            (other) => Math.abs(centerX(other) - centerX(peep)) > 320,
          ),
      );
      const weighted = candidates.flatMap((peep) => peep.cast?.featured ? [peep, peep, peep] : [peep]);
      const next = weighted[Math.floor(Math.random() * weighted.length)];
      if (next) startSpeech(next, time, SPEECH_SECONDS);
    };

    const wrap = (text: string, maxWidth: number) => {
      const lines: string[] = [];
      let line = "";
      for (const word of text.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      if (line) lines.push(line);
      return lines;
    };

    const drawTag = (peep: Peep, name: string) => {
      const size = Math.max(9, Math.round(height * 0.042));
      ctx.save();
      ctx.translate(
        bodyLeft(peep) + width * (peep.scaleX === 1 ? 0.36 : 0.64),
        peep.y + height * 0.64,
      );
      ctx.rotate(peep.scaleX * -0.08);
      ctx.font = `600 ${size}px ${fontFamily}`;
      const tagWidth = ctx.measureText(name).width + size * 1.1;
      const tagHeight = size + 8;
      ctx.beginPath();
      ctx.roundRect(-tagWidth / 2, -tagHeight / 2, tagWidth, tagHeight, 4);
      ctx.fillStyle = "#0369a1";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, 0, 1);
      ctx.restore();
    };

    const drawBubble = (peep: Peep, member: CrowdCastMember, alpha: number) => {
      const padX = 14;
      const padY = 11;
      const lineHeight = 18;
      const labelHeight = 18;
      ctx.font = `500 13px ${fontFamily}`;
      const lines = wrap(member.line, Math.min(232, stage.width - 48));
      const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
      ctx.font = `600 12px ${fontFamily}`;
      const nameWidth = ctx.measureText(member.name).width;
      ctx.font = `500 11px ${fontFamily}`;
      const status = member.call ? "on a call" : "says";
      const labelWidth = 14 + nameWidth + 6 + ctx.measureText(status).width;

      const bubbleWidth = Math.max(textWidth, labelWidth) + padX * 2;
      const bubbleHeight = padY * 2 + labelHeight + lines.length * lineHeight;
      const anchor = centerX(peep);
      const x = clamp(anchor - bubbleWidth / 2, 8, stage.width - bubbleWidth - 8);
      const y =
        Math.max(8, peep.y + height * 0.04 - bubbleHeight - 12) +
        (1 - alpha) * 6;
      const tailX = clamp(anchor, x + 18, x + bubbleWidth - 18);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = "#0c0d10";
      ctx.beginPath();
      ctx.roundRect(x, y, bubbleWidth, bubbleHeight, 14);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(tailX - 7, y + bubbleHeight - 0.5);
      ctx.lineTo(tailX, y + bubbleHeight + 8);
      ctx.lineTo(tailX + 7, y + bubbleHeight - 0.5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tailX - 7, y + bubbleHeight);
      ctx.lineTo(tailX, y + bubbleHeight + 8);
      ctx.lineTo(tailX + 7, y + bubbleHeight);
      ctx.stroke();

      ctx.textBaseline = "middle";
      const labelY = y + padY + labelHeight / 2 - 1;
      ctx.fillStyle = member.call ? "#34d399" : "#7dd3fc";
      ctx.beginPath();
      ctx.arc(x + padX + 3, labelY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `600 12px ${fontFamily}`;
      ctx.fillStyle = "#7dd3fc";
      ctx.fillText(member.name, x + padX + 14, labelY);
      ctx.font = `500 11px ${fontFamily}`;
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText(status, x + padX + 14 + nameWidth + 6, labelY);

      ctx.font = `500 13px ${fontFamily}`;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      lines.forEach((line, index) => {
        ctx.fillText(
          line,
          x + padX,
          y + padY + labelHeight + lineHeight * index + lineHeight / 2,
        );
      });
      ctx.restore();
    };

    const render = () => {
      if (!loaded) return;
      const time = now();
      if (playing() && time >= nextSpeechAt) {
        speakNext(time);
        nextSpeechAt = time + randomRange(1.4, 2.4);
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(pixelRatio, pixelRatio);
      // Named people stand in front, so each tag sits on its own character.
      crowd.sort((a, b) =>
        Number(!!a.cast?.featured) - Number(!!b.cast?.featured) ||
        Number(!!a.cast) - Number(!!b.cast) || a.anchorY - b.anchorY,
      );
      for (const peep of crowd) {
        const portrait = peep.cast && portraits.get(peep.cast.cell);
        const customPortrait = portrait?.complete && portrait.naturalWidth ? portrait : null;
        ctx.save();
        ctx.translate(peep.x, peep.y);
        ctx.scale(peep.scaleX, 1);
        ctx.translate(width / 2, height);
        ctx.rotate(peep.sway);
        ctx.translate(-width / 2, -height);
        ctx.drawImage(
          customPortrait ?? img,
          customPortrait ? 0 : peep.sourceX,
          customPortrait ? 0 : peep.sourceY,
          customPortrait?.naturalWidth ?? sourceWidth,
          customPortrait?.naturalHeight ?? sourceHeight,
          0,
          0,
          width,
          height,
        );
        ctx.restore();
      }
      // Tags sit above the crowd so nobody walking in front hides a name.
      for (const peep of crowd) {
        if (peep.cast) drawTag(peep, peep.cast.name);
      }
      for (const peep of crowd) {
        if (!peep.cast || peep === hovered) continue;
        const alpha = speechAlpha(peep, time);
        if (alpha > 0) drawBubble(peep, peep.cast, alpha);
      }
      if (hovered?.cast) drawBubble(hovered, hovered.cast, 1);
      ctx.restore();
    };

    const stop = () => {
      crowd.forEach((peep) => {
        if (!peep.walk) return;
        gsap.killTweensOf(peep.walk);
        peep.walk.kill();
      });
      crowd.length = 0;
      hovered = null;
      canvas.style.cursor = "";
      gsap.ticker.remove(render);
      ticking = false;
    };

    const syncPlayback = () => {
      const play = playing();
      crowd.forEach((peep) =>
        play && peep !== hovered ? peep.walk?.resume() : peep.walk?.pause(),
      );
      if (play && !ticking) gsap.ticker.add(render);
      if (!play && ticking) gsap.ticker.remove(render);
      ticking = play;
    };

    const pick = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      for (let i = crowd.length - 1; i >= 0; i--) {
        const peep = crowd[i];
        if (!peep.cast) continue;
        const left = bodyLeft(peep);
        if (
          px > left + width * 0.18 &&
          px < left + width * 0.82 &&
          py > peep.y + height * 0.05 &&
          py < peep.y + height
        )
          return peep;
      }
      return null;
    };

    const setHovered = (peep: Peep | null) => {
      if (peep === hovered) return;
      const previous = hovered;
      hovered = peep;
      if (previous && playing()) {
        previous.walk?.resume();
        startSpeech(previous, now() - 1, 1.4);
      }
      if (peep) {
        // Give the hovered person the floor: everyone else wraps up.
        const time = now();
        crowd.forEach((other) => {
          if (other.speech && other !== peep)
            other.speech.end = Math.min(other.speech.end, time + 0.35);
        });
        peep.walk?.pause();
      }
      canvas.style.cursor = peep ? "pointer" : "";
      if (!ticking) render();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "mouse") setHovered(pick(event));
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        const peep = pick(event);
        setHovered(peep === hovered ? null : peep);
      }
    };
    const onPointerLeave = (event: PointerEvent) => {
      if (event.pointerType === "mouse") setHovered(null);
    };

    const resize = () => {
      if (!loaded || disposed) return;
      stop();
      stage.width = canvas.clientWidth;
      stage.height = canvas.clientHeight;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(stage.width * pixelRatio);
      canvas.height = Math.round(stage.height * pixelRatio);
      fontFamily = getComputedStyle(canvas).fontFamily || fontFamily;
      if (!stage.width || !stage.height) return;

      const scale =
        stage.width < 640 ? 0.58 : stage.width < 1024 ? 0.62 : 0.72;
      sourceWidth = img.naturalWidth / rows;
      sourceHeight = img.naturalHeight / cols;
      width = sourceWidth * scale;
      height = sourceHeight * scale;
      // A relaxed, consistent screen-space pace at every viewport width.
      const duration = (stage.width + width) / (32 * scale);

      const count = stage.width < 640
        ? Math.max(6, Math.round(stage.width / 48))
        : Math.max(14, Math.round(stage.width / 20));
      // Keep name tags to about half the crowd on narrow screens.
      const castCells = [...castByCell.keys()]
        .filter((cell) => cell < rows * cols && !skipped.has(cell))
        .sort(() => Math.random() - 0.5)
        .sort((a, b) => Number(!!castByCell.get(b)?.featured) - Number(!!castByCell.get(a)?.featured))
        .slice(0, Math.ceil(count * 0.45));
      const extras = Array.from({ length: rows * cols }, (_, cell) => cell)
        .filter((cell) => !skipped.has(cell) && !castCells.includes(cell))
        .sort(() => Math.random() - 0.5);
      const featuredIndex = castCells.findIndex((cell) => castByCell.get(cell)?.featured);
      if (featuredIndex >= 0) {
        const [featured] = castCells.splice(featuredIndex, 1);
        castCells.splice(Math.floor(castCells.length / 2), 0, featured);
      }
      const cells = [...castCells, ...extras].slice(0, count);

      const startWalk = (peep: Peep) => {
        const direction = Math.random() > 0.5 ? 1 : -1;
        // A shared baseline, with only a small individual walking bob.
        const startY = stage.height - height;
        const startX = direction === 1 ? -width : stage.width + width;
        const endX = direction === 1 ? stage.width : 0;
        peep.x = startX;
        peep.y = startY;
        peep.anchorY = startY;
        peep.scaleX = direction;
        peep.speech = undefined;

        const bobHeight = (peep.cast?.featured ? 3.5 : randomRange(1, 3)) * scale;
        const stepLength = randomRange(17, 21) * scale;
        const stepPhase = randomRange(0, Math.PI * 2);
        const walk = gsap.timeline({
          paused: true,
          onUpdate: () => {
            // Tie the gait to distance so slowing or pausing also slows the bob.
            const phase = Math.abs(peep.x - startX) / stepLength * Math.PI * 2 + stepPhase;
            peep.y = startY - (motionPreference.matches ? 0 : bobHeight * (1 - Math.cos(phase)) / 2);
            peep.sway = motionPreference.matches ? 0 : Math.sin(phase / 2) * (peep.cast?.featured ? 0.018 : 0.007);
          },
        });
        walk.timeScale(peep.speed);
        walk.to(peep, { x: endX, duration, ease: "none" }, 0);
        walk.eventCallback("onComplete", () => {
          if (disposed) return;
          walk.kill();
          startWalk(peep);
          syncPlayback();
        });
        peep.walk = walk;
        return walk;
      };

      cells.forEach((cell, index) => {
        const peep: Peep = {
          sourceX: (cell % rows) * sourceWidth,
          sourceY: Math.floor(cell / rows) * sourceHeight,
          x: 0,
          y: 0,
          anchorY: 0,
          scaleX: 1,
          speed: randomRange(0.85, 1.15),
          sway: 0,
          walk: null,
          cast: castCells.includes(cell) ? castByCell.get(cell) : undefined,
        };
        crowd.push(peep);
        const walk = startWalk(peep);
        if (index < castCells.length) {
          // Spread named people evenly so their tags start apart.
          const along =
            ((index + randomRange(0.3, 0.7)) / castCells.length) *
              stage.width +
            width;
          const progress = along / (stage.width + width);
          walk.progress(peep.scaleX === 1 ? progress : 1 - progress);
        } else {
          walk.progress(Math.random());
          if (motionPreference.matches) {
            peep.x = randomRange(0, stage.width);
          }
        }
      });

      nextSpeechAt = now() + 0.6;
      render();
      syncPlayback();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncPlayback();
    });
    intersectionObserver.observe(canvas);
    motionPreference.addEventListener("change", resize);
    document.addEventListener("visibilitychange", syncPlayback);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerleave", onPointerLeave);
    void document.fonts?.ready.then(() => {
      if (!disposed && !ticking) render();
    });
    img.onload = () => {
      if (disposed) return;
      loaded = true;
      resize();
    };
    img.src = src;
    cast.forEach((member) => {
      if (!member.imageSrc) return;
      const portrait = new Image();
      portraits.set(member.cell, portrait);
      portrait.onload = () => {
        if (!disposed) render();
      };
      portrait.src = member.imageSrc;
    });

    return () => {
      disposed = true;
      img.onload = null;
      portraits.forEach((portrait) => { portrait.onload = null; });
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      motionPreference.removeEventListener("change", resize);
      document.removeEventListener("visibilitychange", syncPlayback);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      stop();
    };
  }, [src, rows, cols, cast, exclude]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cx(
        "absolute inset-x-0 bottom-0 h-[90vh] w-full touch-pan-y",
        className,
      )}
    />
  );
}

export function Skiper39({
  children,
  backdrop,
  crowd,
  className,
}: {
  children?: ReactNode;
  /** Full-bleed layer painted behind the content. */
  backdrop?: ReactNode;
  /** Full-width band under the content, such as a CrowdCanvas stage. */
  crowd?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "relative isolate md:min-h-[calc(100svh-4rem)] overflow-hidden bg-black text-white",
        className,
      )}
    >
      {backdrop}
      <div
        className={cx(
          "relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-5 px-5 pt-8 pb-12 text-center sm:gap-6 sm:pt-16 md:px-8 md:pt-20",
          crowd && "pb-4 md:pb-6",
        )}
      >
        {children ?? (
          <p className="text-headline-medium text-text-tertiary">
            A little less waiting. A lot more building.
          </p>
        )}
      </div>
      {crowd}
    </div>
  );
}

export default Skiper39;
