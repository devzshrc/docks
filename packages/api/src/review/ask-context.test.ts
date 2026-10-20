import assert from "node:assert/strict";
import { test } from "node:test";
import { diffCitations } from "./ask-context.js";
test("citations only point to real new-side lines in supplied files", () => {
  const files = [
    {
      filename: "src/a.ts",
      tier: "core" as const,
      patch: "@@ -5,2 +5,2 @@\n-old\n+new\n context",
      additions: 1,
      deletions: 1,
    },
  ];
  assert.deepEqual(
    diffCitations(
      "src/a.ts:5 src/a.ts:6 src/a.ts:5 src/a.ts:99 secret.ts:1",
      files,
    ),
    [
      { path: "src/a.ts", line: 5, side: "RIGHT" },
      { path: "src/a.ts", line: 6, side: "RIGHT" },
    ],
  );
});

test("old-side citations use a minus sign and carry a PR files-view anchor", async () => {
  const { diffAnchor } = await import("./ask-context.js");
  const files = [
    {
      filename: "src/a.ts",
      tier: "core" as const,
      patch: "@@ -5,3 +5,2 @@\n-gone\n+new\n context\n-also gone",
      additions: 1,
      deletions: 2,
    },
  ];
  // Old side: 5 (gone), 6 (context), 7 (also gone). New side: 5 (new), 6 (context).
  assert.deepEqual(diffCitations("src/a.ts:-5 src/a.ts:-7 src/a.ts:-8 src/a.ts:6", files), [
    { path: "src/a.ts", line: 5, side: "LEFT", anchor: diffAnchor("src/a.ts", "LEFT", 5) },
    { path: "src/a.ts", line: 7, side: "LEFT", anchor: diffAnchor("src/a.ts", "LEFT", 7) },
    { path: "src/a.ts", line: 6, side: "RIGHT" },
  ]);
  assert.match(diffAnchor("src/a.ts", "LEFT", 5), /^diff-[0-9a-f]{64}L5$/);
});

test("pickContextFiles: the selected file alone, else the biggest code changes", async () => {
  const { pickContextFiles } = await import("./ask-context.js");
  const f = (filename: string, tier: string, lines: number, status = "modified") => ({ filename, tier, additions: lines, deletions: 0, status });
  const files = [f("a.ts", "core", 5), f("b.ts", "core", 50), f("lock.yaml", "noise", 900), f("c.test.ts", "test", 80), f("gone.ts", "core", 99, "removed")];
  assert.deepEqual(pickContextFiles(files, "a.ts"), ["a.ts"]);
  assert.deepEqual(pickContextFiles(files), ["b.ts", "a.ts"]);
  assert.deepEqual(pickContextFiles(files, "lock.yaml"), []);
});

test("relativeImports resolves JS/TS and Python relative imports to candidate paths", async () => {
  const { relativeImports } = await import("./ask-context.js");
  const ts = relativeImports("src/review/ask.ts", `import { x } from "./guide.js";\nimport y from "../logger";\nimport z from "zod";`);
  assert.deepEqual(ts.map((c) => c[0]), ["src/review/guide.ts", "src/logger.ts"]);
  assert.ok(ts[0]!.includes("src/review/guide/index.ts"));
  const py = relativeImports("pkg/api/views.py", "from .models import User\nfrom ..utils.text import slug\nimport os");
  assert.deepEqual(py, [["pkg/api/models.py", "pkg/api/models/__init__.py"], ["pkg/utils/text.py", "pkg/utils/text/__init__.py"]]);
});

test("budgetFiles stops at the budget and marks a cut file", async () => {
  const { budgetFiles } = await import("./ask-context.js");
  const out = budgetFiles([{ path: "a", content: "x".repeat(800) }, { path: "b", content: "y".repeat(800) }, { path: "c", content: "z" }], 1200);
  assert.deepEqual(out.map((f) => f.path), ["a"]);
  const cut = budgetFiles([{ path: "a", content: "x".repeat(300) }, { path: "b", content: "y".repeat(2000) }], 1200);
  assert.match(cut[1]!.content, /\[file truncated\]$/);
});
