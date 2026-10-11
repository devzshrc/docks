import { useId, type ComponentProps } from "react";

/**
 * A review queue on a glass tile: two cards waiting behind, the front one checked off.
 * Brand-blue tile with a top glow, faint grain and a lit edge. Keep in sync with app/icon.svg.
 */
export function AppIcon(props: ComponentProps<"svg">) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = (name: string) => `url(#${id}-${name})`;
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden {...props}>
      <defs>
        <linearGradient id={`${id}-tile`} x1="32" y1="0" x2="32" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5a9bfc" />
          <stop offset="0.55" stopColor="#2f7bf5" />
          <stop offset="1" stopColor="#1c5fd0" />
        </linearGradient>
        <radialGradient
          id={`${id}-glow`}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(20 6) rotate(55) scale(46 40)"
        >
          <stop stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-card`} x1="32" y1="29" x2="32" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#eaf2ff" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="32" y1="0" x2="32" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#0b2a66" stopOpacity="0.25" />
        </linearGradient>
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves={2} seed={7} stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id={`${id}-lift`} x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1.6" floodColor="#0b2a66" floodOpacity="0.35" />
        </filter>
        <clipPath id={`${id}-clip`}>
          <rect width="64" height="64" rx="15" />
        </clipPath>
      </defs>
      <g clipPath={ref("clip")}>
        <rect width="64" height="64" fill={ref("tile")} />
        <rect width="64" height="64" fill={ref("glow")} />
        <rect width="64" height="64" filter={ref("grain")} opacity="0.1" />
        <rect x="20" y="15.5" width="24" height="8" rx="3" fill="#9dc3fc" />
        <rect x="16" y="21" width="32" height="10" rx="3.5" fill="#c9defe" />
        <rect x="12" y="27.5" width="40" height="21" rx="5.5" fill={ref("card")} filter={ref("lift")} />
        <path d="M20.5 38.2l3.6 3.6 7.2-7.4" stroke="#2f7bf5" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="35" y="36.4" width="10" height="3.6" rx="1.8" fill="#2f7bf5" fillOpacity="0.28" />
        <rect x="0.5" y="0.5" width="63" height="63" rx="14.5" stroke={ref("edge")} />
      </g>
    </svg>
  );
}
