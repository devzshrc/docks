import type { RiskTier } from "./types.js";

/** plan.md §6.2 — deterministic file risk tiers. */

const NOISE = [
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|Cargo\.lock|go\.sum|poetry\.lock|Gemfile\.lock|composer\.lock)$/,
  // Output directories only. Not "build/": real source lives there too
  // (e.g. astro's src/core/build/, hono's build/ scripts).
  /(^|\/)(dist|\.next|vendor|generated|__generated__)\//,
  /\.(min\.js|map|snap|svg|png|jpe?g|gif|ico|webp)$/,
  /(^|\/)drizzle\/meta\//,
];
const TEST = [
  /\.(test|spec)\.[cm]?[jt]sx?$/, // JS/TS
  /_test\.go$/, // Go
  /(^|\/)test_[^/]+\.py$/, // Python (pytest)
  /_test\.py$/,
  /_spec\.rb$/, // Ruby
  /(Test|Tests|IT)\.(java|kt)$/, // JVM
  /(^|\/)(__tests__|tests?|e2e|spec)\//,
];
const CONFIG = [
  /(^|\/)(package\.json|tsconfig[^/]*\.json|turbo\.json|Dockerfile|docker-compose\.ya?ml)$/,
  /\.(ya?ml|toml|ini)$/,
  /(^|\/)\.env\.example$/,
  /(^|\/)\.github\//,
];

export function tierOf(path: string): RiskTier {
  if (NOISE.some((r) => r.test(path))) return "noise";
  if (TEST.some((r) => r.test(path))) return "test";
  if (CONFIG.some((r) => r.test(path))) return "config";
  return "core";
}
