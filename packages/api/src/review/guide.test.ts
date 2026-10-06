import assert from "node:assert/strict";
import { test } from "node:test";
import { fallbackGuide, validateGuide } from "./guide.js";

const files = [
  { filename: "src/a.ts", tier: "core" as const, additions: 1, deletions: 0 },
  { filename: "src/b/c.ts", tier: "core" as const, additions: 1, deletions: 0 },
  { filename: "pnpm-lock.yaml", tier: "noise" as const, additions: 9, deletions: 0 },
];

test("validateGuide drops invented paths, duplicates, and emptied steps", () => {
  const g = validateGuide(
    {
      summary: " s ",
      steps: [
        { title: "Real", why: "w", files: ["src/a.ts", "src/a.ts", "made/up.ts"] },
        { title: "Invented only", why: "w", files: ["nope.ts"] },
      ],
      checklist: [{ question: "Q?", files: ["nope.ts"] }],
    },
    files,
  );
  assert.equal(g.summary, "s");
  assert.deepEqual(g.steps, [{ title: "Real", why: "w", files: ["src/a.ts"] }]);
  assert.deepEqual(g.checklist, [{ question: "Q?", files: [] }]);
});

test("fallbackGuide groups by folder and skips noise", () => {
  const g = fallbackGuide(files, "reason");
  assert.equal(g.source, "fallback");
  assert.deepEqual(
    g.steps.map((s) => s.files),
    [["src/a.ts"], ["src/b/c.ts"]],
  );
});
