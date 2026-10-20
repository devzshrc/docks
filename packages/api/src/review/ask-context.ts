import { createHash } from "node:crypto";
import type { AskCitation } from "@docks/db";
import type { GuideFile } from "./guide.js";

/** Old (LEFT) and new (RIGHT) line numbers each patch actually shows. */
function patchLines(patch: string) {
  const left = new Set<number>();
  const right = new Set<number>();
  let oldLine = 0;
  let newLine = 0;
  for (const text of patch.split("\n")) {
    const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
    } else if (!newLine || text.startsWith("\\")) continue;
    else if (text.startsWith("-")) left.add(oldLine++);
    else if (text.startsWith("+")) right.add(newLine++);
    else {
      left.add(oldLine++);
      right.add(newLine++);
    }
  }
  return { left, right };
}

/** GitHub's PR files-view anchor for a line. */
export function diffAnchor(path: string, side: "LEFT" | "RIGHT", line: number) {
  return `diff-${createHash("sha256").update(path).digest("hex")}${side === "LEFT" ? "L" : "R"}${line}`;
}

/**
 * Validate model citations against lines in the supplied patches.
 * `path:42` is a new-side line; `path:-42` is an old-side (deleted or context) line.
 */
export function diffCitations(answer: string, files: GuideFile[]): AskCitation[] {
  const allowed = new Map(files.map((f) => [f.filename, patchLines(f.patch ?? "")]));
  const citations: AskCitation[] = [];
  for (const m of answer.matchAll(/([\w./@-]+\.\w+):(-?)(\d+)/g)) {
    const path = m[1]!;
    const side = m[2] ? "LEFT" : "RIGHT";
    const line = Number(m[3]);
    const lines = allowed.get(path);
    if (!lines?.[side === "LEFT" ? "left" : "right"].has(line)) continue;
    if (citations.some((c) => c.path === path && c.line === line && c.side === side)) continue;
    citations.push(side === "LEFT" ? { path, line, side, anchor: diffAnchor(path, side, line) } : { path, line, side });
  }
  return citations;
}

/** Budget for full-file context sent with a question, on top of the diff. */
export const FULL_FILE_BUDGET = 40_000;
const MAX_FULL_FILES = 5;
const MAX_IMPORTS = 3;

/**
 * Which changed files to send whole: the selected one first, then the biggest
 * code changes. Generated files and deletions are never worth it.
 */
export function pickContextFiles(
  files: { filename: string; tier: string; additions: number; deletions: number; status?: string | null }[],
  selected?: string | null,
): string[] {
  const usable = files.filter((f) => f.tier !== "noise" && f.status !== "removed");
  // A question about one file gets that file (and its imports), nothing else.
  if (selected) return usable.some((f) => f.filename === selected) ? [selected] : [];
  return usable
    .filter((f) => f.tier === "core")
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .map((f) => f.filename)
    .slice(0, MAX_FULL_FILES);
}

/** Candidate repo paths for one file's relative imports (JS/TS and Python), nearest first. */
export function relativeImports(path: string, content: string): string[][] {
  const dir = path.split("/").slice(0, -1);
  const resolve = (spec: string) => {
    const parts = [...dir];
    for (const seg of spec.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== "." && seg) parts.push(seg);
    }
    return parts.join("/");
  };
  const out: string[][] = [];
  if (/\.[cm]?[jt]sx?$/.test(path)) {
    for (const m of content.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
      const base = resolve(m[1]!).replace(/\.[cm]?js$/, "");
      out.push([".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"].map((ext) => base + ext));
    }
  } else if (path.endsWith(".py")) {
    for (const m of content.matchAll(/^from\s+(\.+)([\w.]*)\s+import/gm)) {
      const up = m[1]!.length - 1;
      const base = [...dir.slice(0, dir.length - up), ...m[2]!.split(".").filter(Boolean)].join("/");
      out.push([`${base}.py`, `${base}/__init__.py`]);
    }
  }
  const seen = new Set<string>();
  return out.filter((c) => !seen.has(c[0]!) && seen.add(c[0]!)).slice(0, MAX_IMPORTS);
}

/** Keep whole files in order until the budget runs out; the last one may be cut with a marker. */
export function budgetFiles(files: { path: string; content: string }[], budget = FULL_FILE_BUDGET) {
  const out: { path: string; content: string }[] = [];
  let left = budget;
  for (const f of files) {
    if (left <= 500) break;
    const content = f.content.length > left ? `${f.content.slice(0, left)}\n[file truncated]` : f.content;
    out.push({ path: f.path, content });
    left -= Math.min(f.content.length, left);
  }
  return out;
}
