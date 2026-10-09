import { useId, type ComponentProps } from "react";

/** Dock + review check on a graphite tile. Same geometry as the favicon. */
export function AppIcon(props: ComponentProps<"svg">) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden {...props}>
      <defs>
        <linearGradient id={`${id}-tile`} x1="32" y1="0" x2="32" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3a3a3f" />
          <stop offset="1" stopColor="#111113" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#${id}-tile)`} />
      <rect x="1" y="1" width="62" height="62" rx="17" stroke="white" strokeOpacity="0.14" strokeWidth="2" />
      <path
        d="M18 16h12c14 0 22 7 22 16s-8 16-22 16H18V16Z"
        stroke="white"
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <path
        d="m28 32 6 6 16-17"
        stroke="white"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
