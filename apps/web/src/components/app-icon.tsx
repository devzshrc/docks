import { useId, type ComponentProps } from "react";

/**
 * A three-row checklist on a tile: the first item checked, the rest fading. Review, in order.
 * Graphite tile in light mode, white tile in dark mode (colors come from --logo-* in globals.css).
 */
export function AppIcon(props: ComponentProps<"svg">) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden {...props}>
      <defs>
        <linearGradient id={`${id}-tile`} x1="32" y1="0" x2="32" y2="64" gradientUnits="userSpaceOnUse">
          <stop style={{ stopColor: "var(--logo-tile-a)" }} />
          <stop offset="1" style={{ stopColor: "var(--logo-tile-b)" }} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id}-tile)`} />
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15.25" strokeWidth="1.5" style={{ stroke: "var(--logo-edge)" }} />
      <path d="M15 20.5l3.6 3.6L25 17.2" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--logo-check)" }} />
      <g style={{ fill: "var(--logo-ink)" }}>
        <rect x="30" y="18.4" width="19" height="4.4" rx="2.2" />
        <circle cx="20" cy="32" r="2.6" fillOpacity="0.55" />
        <rect x="30" y="29.8" width="14" height="4.4" rx="2.2" fillOpacity="0.55" />
        <circle cx="20" cy="43.5" r="2.6" fillOpacity="0.28" />
        <rect x="30" y="41.3" width="9" height="4.4" rx="2.2" fillOpacity="0.28" />
      </g>
    </svg>
  );
}
