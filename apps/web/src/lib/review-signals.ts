/* Deterministic hints that make a review faster: what can be skipped (noise) and which lines most
 * need human eyes (risk). Pure and cheap, so it runs on every diff in the browser. */

import type { DiffLine } from "./diff"

export type RiskKind = "auth" | "data" | "money" | "concurrency" | "unsafe" | "tests" | "secrets"

export const RISK_LABEL: Record<RiskKind, string> = {
  auth: "Auth & access",
  data: "Schema & data",
  money: "Payments",
  concurrency: "Concurrency",
  unsafe: "Unsafe code",
  tests: "Removed tests",
  secrets: "Possible secret",
}

const RULES: { kind: RiskKind; re: RegExp; on: "add" | "del" | "both" }[] = [
  { kind: "secrets", re: /(api[_-]?key|secret|password|private[_-]?key|token)\s*[:=]\s*["'`][^"'`\s]{8,}/i, on: "add" },
  { kind: "auth", re: /\b(auth\w*|password|permission\w*|role|isAdmin|session|jwt|csrf|oauth|login|logout|signIn|signOut|bcrypt|hash(Password)?)\b/i, on: "add" },
  { kind: "data", re: /\b(ALTER\s+TABLE|DROP\s+(TABLE|COLUMN|INDEX)|CREATE\s+(TABLE|INDEX)|TRUNCATE|DELETE\s+FROM|migration|onDelete|cascade)\b/i, on: "add" },
  { kind: "money", re: /\b(price|amount|currency|invoice|payment|charge|refund|billing|subscription|stripe|cents)\b/i, on: "add" },
  { kind: "concurrency", re: /\b(Promise\.all|Mutex|lock\(|unlock\(|semaphore|race|atomic|transaction|setInterval|Worker\()/, on: "add" },
  { kind: "unsafe", re: /\b(eval\(|new Function\(|dangerouslySetInnerHTML|innerHTML\s*=|child_process|exec\(|execSync\(|\bany\b as|@ts-ignore|eslint-disable)/, on: "add" },
  { kind: "tests", re: /\b(it|test|describe)(\.only|\.skip)?\(|\bexpect\(/, on: "del" },
]

/** Lines that look risky, keyed by the line object, with the reason to show on hover. */
export function riskyLines(path: string, lines: DiffLine[]): Map<DiffLine, RiskKind> {
  const out = new Map<DiffLine, RiskKind>()
  // Tests and docs mention auth or money constantly; flagging every line there is noise.
  const lowSignal = /(\.(md|mdx|txt|snap)$)|(\.(test|spec)\.)|(^|\/)(__tests__|tests?|e2e|docs?)\//.test(path)
  for (const line of lines) {
    if (line.kind !== "add" && line.kind !== "del") continue
    for (const rule of RULES) {
      if (rule.on !== "both" && rule.on !== line.kind) continue
      if (lowSignal && rule.kind !== "tests" && rule.kind !== "secrets") continue
      if (rule.kind === "tests" && !/(\.(test|spec)\.)|(^|\/)(__tests__|tests?|e2e)\//.test(path)) continue
      if (rule.re.test(line.text)) {
        out.set(line, rule.kind)
        break
      }
    }
  }
  return out
}

/** The distinct risk kinds in a file, most severe first. */
export function riskSummary(risky: Map<DiffLine, RiskKind>): RiskKind[] {
  const order: RiskKind[] = ["secrets", "unsafe", "data", "auth", "money", "concurrency", "tests"]
  const seen = new Set(risky.values())
  return order.filter((k) => seen.has(k))
}

/** True when every change only moves whitespace or line breaks around: safe to skip by default. */
export function formattingOnly(lines: DiffLine[]): boolean {
  const squash = (kind: "add" | "del") =>
    lines
      .filter((l) => l.kind === kind)
      .map((l) => l.text)
      .join("")
      .replace(/\s+/g, "")
  const added = lines.some((l) => l.kind === "add")
  const removed = lines.some((l) => l.kind === "del")
  if (!added || !removed) return false
  return squash("add") === squash("del")
}

/** Rough minutes a careful review takes: reading speed drops on risky and non-test code. */
export function reviewMinutes(files: { additions: number; deletions: number; tier: string }[]): number {
  let lines = 0
  for (const f of files) {
    if (f.tier === "noise") continue
    const weight = f.tier === "test" ? 0.5 : f.tier === "config" ? 0.6 : 1
    lines += (f.additions + f.deletions * 0.4) * weight
  }
  return Math.max(1, Math.round(lines / 12))
}
