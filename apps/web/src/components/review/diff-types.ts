import type { CommentLabel } from "@/lib/diff";

/** Shapes and display constants shared by the diff viewer's parts. */
export type Side = "LEFT" | "RIGHT";
export type PendingComment = {
  path: string;
  line: number;
  startLine?: number;
  side: Side;
  body: string;
};
export type Thread = {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  diffSide: Side;
  comments: { id: number; author: string; body: string; createdAt: string }[];
};

export const ROW = {
  hunk: "bg-info-bg/50 text-muted-foreground",
  add: "bg-success/10",
  del: "bg-danger/10",
  ctx: "",
} as const;
/** Above this many rows a file's lines are windowed (only the ones near the viewport are mounted). */
export const VIRTUAL_AT = 300;
/** Past this many changed lines a diff waits for an explicit click before it renders at all. */
export const LARGE_DIFF = 8000;
/** One-click questions about a line, answered by the PR's Ask panel with this line as context. */
export const ASK_PRESETS: [string, (code: string, path: string, line: number) => string][] = [
  ["Explain", (code, path, line) => `Explain what ${path}:${line} does and why it changed: \`${code.slice(0, 160)}\``],
  ["Who uses this?", (code, path, line) => `Where is the code at ${path}:${line} called or used, and could this change break any caller? \`${code.slice(0, 160)}\``],
  ["Risks?", (code, path, line) => `What could go wrong with ${path}:${line}? Think about edge cases, security and performance. \`${code.slice(0, 160)}\``],
];
export const TIER_LABEL = {
  core: null,
  config: "config",
  test: "test",
  noise: "generated / lockfile",
} as const;

export const LABEL_STYLE: Record<CommentLabel, string> = {
  nit: "bg-muted text-muted-foreground",
  question: "bg-primary/15 text-info-text",
  suggestion: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  blocking: "bg-red-500/15 text-red-700 dark:text-red-300",
  praise: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};
