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
