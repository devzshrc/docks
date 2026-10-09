"use client";

import { gsap } from "gsap";
import { useEffect, useRef, type ReactNode } from "react";

import { cx } from "@/utils/cx";

const CROWD_SPRITE = "/landing/crowd-peeps.png";

interface CrowdCanvasProps {
  src: string;
  /** Sprite cells across the image, matching the supplied Skiper sprite. */
  rows?: number;
  /** Sprite cells down the image. */
  cols?: number;
  className?: string;
}

type Peep = {
  sourceX: number;
  sourceY: number;
  x: number;
  y: number;
  anchorY: number;
  scaleX: number;
};

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
    const crowd: Peep[] = [];
    const walks: gsap.core.Timeline[] = [];
    const randomRange = (min: number, max: number) =>
      min + Math.random() * (max - min);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(pixelRatio, pixelRatio);
      crowd.sort((a, b) => a.anchorY - b.anchorY);
      for (const peep of crowd) {
        ctx.save();
        ctx.translate(peep.x, peep.y);
        ctx.scale(peep.scaleX, 1);
        ctx.drawImage(
          img,
          peep.sourceX,
          peep.sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          width,
          height,
        );
        ctx.restore();
      }
      ctx.restore();
    };

    const stop = () => {
      walks.forEach((walk) => walk.kill());
      walks.length = 0;
      crowd.length = 0;
      gsap.ticker.remove(render);
      ticking = false;
    };

    const syncPlayback = () => {
      const playing =
        loaded && visible && !document.hidden && !motionPreference.matches;
      walks.forEach((walk) => (playing ? walk.resume() : walk.pause()));
      if (playing && !ticking) gsap.ticker.add(render);
      if (!playing && ticking) gsap.ticker.remove(render);
      ticking = playing;
    };

    const resize = () => {
      if (!loaded || disposed) return;
      stop();
      stage.width = canvas.clientWidth;
      stage.height = canvas.clientHeight;
      pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(stage.width * pixelRatio);
      canvas.height = Math.round(stage.height * pixelRatio);
      if (!stage.width || !stage.height) return;

      sourceWidth = img.naturalWidth / rows;
      sourceHeight = img.naturalHeight / cols;
      height = sourceHeight;
      width = sourceWidth;
      const count = rows * cols;
      const cells = Array.from({ length: count }, (_, index) => index);

      const startWalk = (peep: Peep, index: number) => {
        walks[index]?.kill();
        const direction = Math.random() > 0.5 ? 1 : -1;
        const offsetY = 100 - 250 * gsap.parseEase("power2.in")(Math.random());
        const startY = stage.height - height + offsetY;
        const startX = direction === 1 ? -width : stage.width + width;
        const endX = direction === 1 ? stage.width : 0;
        peep.x = startX;
        peep.y = startY;
        peep.anchorY = startY;
        peep.scaleX = direction;

        const walk = gsap.timeline({ paused: true });
        walk.timeScale(randomRange(0.5, 1.5));
        walk.to(peep, { x: endX, duration: 10, ease: "none" }, 0);
        walk.to(
          peep,
          { y: startY - 10, duration: 0.25, repeat: 40, yoyo: true },
          0,
        );
        walk.eventCallback("onComplete", () => {
          if (disposed) return;
          startWalk(peep, index);
          syncPlayback();
        });
        walks[index] = walk;
        return walk;
      };

      for (let i = 0; i < count; i++) {
        const cell = cells.splice(
          Math.floor(Math.random() * cells.length),
          1,
        )[0];
        const peep: Peep = {
          sourceX: (cell % rows) * sourceWidth,
          sourceY: Math.floor(cell / rows) * sourceHeight,
          x: 0,
          y: 0,
          anchorY: 0,
          scaleX: 1,
        };
        crowd.push(peep);
        const walk = startWalk(peep, i);
        walk.progress(Math.random());
        if (motionPreference.matches) {
          peep.x = randomRange(0, stage.width);
        }
      }

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
    window.addEventListener("resize", resize);
    img.onload = () => {
      if (disposed) return;
      loaded = true;
      resize();
    };
    img.src = src;

    return () => {
      disposed = true;
      img.onload = null;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      motionPreference.removeEventListener("change", resize);
      document.removeEventListener("visibilitychange", syncPlayback);
      window.removeEventListener("resize", resize);
      stop();
    };
  }, [src, rows, cols]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cx(
        "pointer-events-none absolute inset-x-0 bottom-0 h-[90vh] w-full",
        className,
      )}
    />
  );
}

export function Skiper39({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "relative isolate min-h-[calc(100svh-4rem)] overflow-hidden bg-background-primary-default text-text-primary",
        className,
      )}
    >
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-6 px-5 pt-16 pb-80 text-center md:px-8 md:pt-20">
        {children ?? (
          <p className="text-headline-medium text-text-tertiary">
            A little less waiting. A lot more building.
          </p>
        )}
      </div>
      <CrowdCanvas src={CROWD_SPRITE} />
    </div>
  );
}

export default Skiper39;
