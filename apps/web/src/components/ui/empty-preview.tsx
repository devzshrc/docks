import type { ComponentType, ReactNode } from "react";

import { cx as cn } from "@/utils/cx";

/** One hue per area of the app, used for its icon, accents and empty states. */
export const HUE = {
  indigo: {
    text: "text-hue-indigo",
    bg: "bg-hue-indigo",
    soft: "bg-hue-indigo/12",
    ring: "ring-hue-indigo/25",
  },
  blue: {
    text: "text-hue-blue",
    bg: "bg-hue-blue",
    soft: "bg-hue-blue/12",
    ring: "ring-hue-blue/25",
  },
  green: {
    text: "text-hue-green",
    bg: "bg-hue-green",
    soft: "bg-hue-green/12",
    ring: "ring-hue-green/25",
  },
  amber: {
    text: "text-hue-amber",
    bg: "bg-hue-amber",
    soft: "bg-hue-amber/12",
    ring: "ring-hue-amber/25",
  },
  pink: {
    text: "text-hue-pink",
    bg: "bg-hue-pink",
    soft: "bg-hue-pink/12",
    ring: "ring-hue-pink/25",
  },
  teal: {
    text: "text-hue-teal",
    bg: "bg-hue-teal",
    soft: "bg-hue-teal/12",
    ring: "ring-hue-teal/25",
  },
  orange: {
    text: "text-hue-orange",
    bg: "bg-hue-orange",
    soft: "bg-hue-orange/12",
    ring: "ring-hue-orange/25",
  },
  purple: {
    text: "text-hue-purple",
    bg: "bg-hue-purple",
    soft: "bg-hue-purple/12",
    ring: "ring-hue-purple/25",
  },
  red: {
    text: "text-hue-red",
    bg: "bg-hue-red",
    soft: "bg-hue-red/12",
    ring: "ring-hue-red/25",
  },
} as const;
export type Hue = keyof typeof HUE;

type Icon = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

/** Icon on a soft tinted tile. */
export function HueIcon({
  icon: Icon,
  hue,
  className,
}: {
  icon: Icon;
  hue: Hue;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
        HUE[hue].soft,
        HUE[hue].text,
        HUE[hue].ring,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
    </span>
  );
}

const bar = "rounded-full bg-foreground/[0.07]";

/** A ghost list row: the shape of what will appear here, without data. */
export function GhostRow({
  hue,
  accent,
  wide = 62,
  meta = true,
}: {
  hue: Hue;
  accent?: "bar" | "chip" | "ring";
  wide?: number;
  meta?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-card/70 px-3 py-2.5 shadow-card">
      <span className={cn("size-6 shrink-0 rounded-full", HUE[hue].soft)} />
      <span className="grid min-w-0 flex-1 gap-1.5">
        <span className={cn("h-2", bar)} style={{ width: `${wide}%` }} />
        {meta && <span className={cn("h-1.5 w-1/3", bar)} />}
        {accent === "bar" && (
          <span className="mt-1 h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
            <span
              className={cn(
                "block h-full rounded-full opacity-70",
                HUE[hue].bg,
              )}
              style={{ width: `${100 - wide / 1.4}%` }}
            />
          </span>
        )}
      </span>
      {accent === "chip" && (
        <span className={cn("h-5 w-14 shrink-0 rounded-full", HUE[hue].soft)} />
      )}
      {accent === "ring" && (
        <span
          className={cn(
            "size-5 shrink-0 rounded-full border-2 border-current opacity-60",
            HUE[hue].text,
          )}
        />
      )}
    </div>
  );
}

/**
 * Empty state that shows what the space will hold: a faded preview of the real content on top,
 * then a short explanation and the next step.
 */
export function EmptyPreview({
  icon,
  hue,
  title,
  description,
  action,
  preview,
  className,
}: {
  icon: Icon;
  hue: Hue;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  preview?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl px-6 pt-6 pb-8 text-center",
        className,
      )}
    >
      {preview && (
        <div aria-hidden className="mx-auto mb-6 max-w-md opacity-50">
          {preview}
        </div>
      )}
      <div className="relative flex flex-col items-center gap-2">
        <HueIcon
          icon={icon}
          hue={hue}
          className="size-10 rounded-xl bg-background-tertiary-default text-text-secondary ring-separator-border [&_svg]:size-5"
        />
        <h3 className="mt-2 text-body-medium text-text-primary">{title}</h3>
        {description && (
          <p className="max-w-sm text-body-2-regular text-text-secondary text-balance">
            {description}
          </p>
        )}
        {action && (
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

/** Plan note at the top of a page: what the Team plan adds here, with one button. */
export function UpgradeCallout({
  icon,
  children,
  action,
}: {
  icon: Icon;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/15 bg-primary-alpha-10 p-4">
      <HueIcon icon={icon} hue="indigo" />
      <p className="min-w-0 flex-1 text-[13px] text-foreground/90">
        {children}
      </p>
      {action}
    </div>
  );
}

/** Faded bars in place of a chart that has no data yet. */
export function ChartGhost({
  bars = [38, 52, 44, 66, 58, 74, 62, 80, 70, 86],
}: {
  bars?: number[];
}) {
  return (
    <div
      aria-hidden
      className="flex h-36 items-end gap-2 [mask-image:linear-gradient(to_top,black,transparent)] opacity-60"
    >
      {bars.map((h, i) => (
        <span
          key={i}
          className="bg-hue-indigo/15 flex-1 rounded-t-md"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}
