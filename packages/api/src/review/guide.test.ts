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

test("chunkFiles keeps folders together and caps chunk size", async () => {
  const { chunkFiles } = await import("./guide.js");
  const mk = (dir: string, n: number) => Array.from({ length: n }, (_, i) => ({ filename: `${dir}/f${i}.ts` }));
  const files = [...mk("api", 60), ...mk("web", 50), ...mk("db", 30)];
  const chunks = chunkFiles(files, 100);
  assert.ok(chunks.every((c) => c.length <= 100));
  assert.equal(chunks.flat().length, files.length);
  // api (60) first; web (50) doesn't fit beside it, so it starts chunk 2 with db.
  assert.deepEqual(chunks.map((c) => new Set(c.map((f) => f.filename.split("/")[0]))).map((s) => [...s].sort()), [["api"], ["db", "web"]]);
  assert.equal(chunkFiles(mk("x", 250), 100).length, 3, "one huge folder is split");
});

test("mergeGuides concatenates steps and sums tokens", async () => {
  const { mergeGuides } = await import("./guide.js");
  const part = (s: string) => ({
    guide: { source: "ai" as const, summary: s, steps: [{ title: s, why: "", files: [`${s}.ts`] }], checklist: [] },
    model: "m",
    inputTokens: 10,
    outputTokens: 5,
    invalidPaths: [],
  });
  const m = mergeGuides([part("a"), part("b")], 150);
  assert.deepEqual(m.guide.steps.map((s) => s.title), ["a", "b"]);
  assert.equal(m.inputTokens, 20);
  assert.match(m.guide.summary, /150 files, guided in 2 parts/);
});
