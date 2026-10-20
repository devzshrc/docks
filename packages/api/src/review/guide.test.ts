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

test("fallbackGuide folds a long tail of folders into one step", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({
    filename: `pkg${i}/src/f.ts`,
    tier: "core" as const,
    additions: 1,
    deletions: 0,
  }));
  const g = fallbackGuide(many, "r");
  assert.equal(g.steps.length, 6);
  assert.equal(g.steps.flatMap((s) => s.files).length, 9);
  assert.match(g.steps[5]!.title, /Other folders \(4\)/);
});

test("fallbackGuide reads by tier when there are too few folders", () => {
  const flat = [
    { filename: "src/a.ts", tier: "core" as const, additions: 1, deletions: 0 },
    { filename: "src/a.test.ts", tier: "test" as const, additions: 1, deletions: 0 },
    { filename: "src/config.yml", tier: "config" as const, additions: 1, deletions: 0 },
  ];
  const g = fallbackGuide(flat, "r");
  assert.deepEqual(g.steps.map((s) => s.title), ["Application code", "Configuration", "Tests"]);
});

test("truncatePatch keeps every hunk header", async () => {
  const { truncatePatch } = await import("./guide.js");
  const hunk = (n: number) => [`@@ -${n},50 +${n},50 @@`, ...Array.from({ length: 50 }, (_, i) => `+line ${n}-${i} ${"x".repeat(40)}`)];
  const patch = [...hunk(1), ...hunk(100), ...hunk(200)].join("\n");
  const out = truncatePatch(patch, 2000);
  assert.ok(out.length < patch.length);
  for (const n of [1, 100, 200]) assert.ok(out.includes(`@@ -${n},50 +${n},50 @@`));
  assert.match(out, /all 3 hunk headers kept/);
  assert.equal(truncatePatch("small", 2000), "small");
});
