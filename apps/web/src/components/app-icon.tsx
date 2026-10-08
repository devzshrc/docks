import type { ComponentProps } from "react";
/** Dock + review check. Same geometry as the favicon. */
export function AppIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden {...props}>
      <rect width="64" height="64" rx="18" className="fill-primary" />
      <path
        d="M18 16h12c14 0 22 7 22 16s-8 16-22 16H18V16Z"
        className="stroke-primary-foreground"
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <path
        d="m28 32 6 6 16-17"
        className="stroke-brand-lime"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
