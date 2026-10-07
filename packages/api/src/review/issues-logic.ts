/** Pure helpers for the Issues section: PR links, board status, aging and insights math. */

const CLOSES = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)[:\s]+(?:[\w.-]+\/[\w.-]+)?#(\d+)\b/gi;
const MENTION = /(?<![\w/])#(\d+)\b/g;

/** Issue numbers a pull request says it closes, and ones it only mentions. */
export function issueRefs(text: string): { closes: number[]; mentions: number[] } {
  const closes = new Set<number>();
  for (const m of text.matchAll(CLOSES)) closes.add(Number(m[1]));
  const mentions = new Set<number>();
  for (const m of text.matchAll(MENTION)) if (!closes.has(Number(m[1]))) mentions.add(Number(m[1]));
  return { closes: [...closes], mentions: [...mentions] };
}

export type IssueStatus = "todo" | "in_progress" | "in_review" | "done";

/** Where an issue sits: derived from GitHub, so nobody drags cards. */
export function statusOf(i: { state: "open" | "closed"; assignees: string[] }, prs: { state: "open" | "closed" | "merged"; draft: boolean }[]): IssueStatus {
  if (i.state === "closed") return "done";
  if (prs.some((p) => p.state === "open" && !p.draft)) return "in_review";
  if (prs.some((p) => p.state === "open") || i.assignees.length > 0) return "in_progress";
  return "todo";
}

export const DAY = 24 * 3_600_000;

export const isStale = (updatedAt: Date, days: number, now = Date.now()) => now - updatedAt.getTime() > days * DAY;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Start of the ISO week (Monday, UTC) for a date, as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

/** The last `n` week starts, oldest first. */
export function lastWeeks(n: number, now = new Date()): string[] {
  const out: string[] = [];
  const cur = new Date(weekStart(now) + "T00:00:00Z");
  for (let i = n - 1; i >= 0; i--) out.push(new Date(cur.getTime() - i * 7 * DAY).toISOString().slice(0, 10));
  return out;
}

export function ageBucket(createdAt: Date, now = Date.now()): "week" | "month" | "quarter" | "older" {
  const days = (now - createdAt.getTime()) / DAY;
  return days < 7 ? "week" : days < 30 ? "month" : days < 90 ? "quarter" : "older";
}
