import { cn } from "@/lib/utils";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Film grain over a gradient, so large soft fields of color never band. */
export function Grain({ className, opacity = 0.05 }: { className?: string; opacity?: number }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 mix-blend-multiply", className)}
      style={{ backgroundImage: GRAIN, opacity }}
    />
  );
}

/**
 * The hero light: a warm wash from the left, a cool one from the right, meeting in a pale lilac
 * haze. Low saturation and grain keep it closer to morning light than to a neon gradient.
 */
export function HeroLight({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 h-[1100px] overflow-hidden", className)}>
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(38% 34% at 14% 10%, rgb(214 234 245 / 0.55), transparent 72%)",
            "radial-gradient(42% 40% at 86% 6%, rgb(200 225 240 / 0.55), transparent 70%)",
            "radial-gradient(46% 42% at 50% 0%, rgb(3 105 161 / 0.32), transparent 72%)",
            "radial-gradient(30% 26% at 62% 30%, rgb(125 200 235 / 0.28), transparent 72%)",
          ].join(","),
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(17 17 19 / 0.045) 1px, transparent 1px), linear-gradient(to bottom, rgb(17 17 19 / 0.045) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(60% 50% at 50% 18%, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(60% 50% at 50% 18%, black, transparent 75%)",
        }}
      />
      <Grain opacity={0.06} />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-white" />
    </div>
  );
}

/** Dark stage for the closing call to action: graphite with a low ember and a cool rim. */
export function NightLight({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(60% 70% at 50% 125%, rgb(3 105 161 / 0.45), transparent 70%)",
            "radial-gradient(40% 50% at 12% 115%, rgb(170 225 240 / 0.14), transparent 70%)",
            "radial-gradient(38% 50% at 90% 110%, rgb(56 160 210 / 0.16), transparent 70%)",
            "linear-gradient(180deg, #000000 0%, #030507 100%)",
          ].join(","),
        }}
      />
      <div className="absolute inset-x-[15%] top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <Grain opacity={0.08} className="mix-blend-overlay" />
    </div>
  );
}
