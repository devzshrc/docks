import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Post-auth redirect from ?next=, limited to same-site paths (no open redirects). */
export function nextPath(fallback = "/review"): string {
  if (typeof window === "undefined") return fallback
  const next = new URLSearchParams(window.location.search).get("next")
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : fallback
}
