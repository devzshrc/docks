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
