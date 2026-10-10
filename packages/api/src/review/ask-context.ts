import type { GuideFile } from "./guide.js";

/** Validate model citations against actual lines in the supplied patch. */
export function diffCitations(answer: string, files: GuideFile[]) {
  const allowed = new Map<string, Set<number>>();
  for (const file of files) {
    const lines = new Set<number>();
    let line = 0;
    for (const text of (file.patch ?? "").split("\n")) {
      const hunk = text.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
      if (hunk) line = Number(hunk[1]);
      else if (line && !text.startsWith("-") && !text.startsWith("\\"))
        lines.add(line++);
    }
    allowed.set(file.filename, lines);
  }
  const citations: { path: string; line: number; side: "RIGHT" }[] = [];
  for (const m of answer.matchAll(/([\w./@-]+\.\w+):(\d+)/g)) {
    const path = m[1]!;
    const line = Number(m[2]);
    if (
      allowed.get(path)?.has(line) &&
      !citations.some((c) => c.path === path && c.line === line)
    )
      citations.push({ path, line, side: "RIGHT" });
  }
  return citations;
}
