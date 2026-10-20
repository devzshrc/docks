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
