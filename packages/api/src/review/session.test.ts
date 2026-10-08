import assert from "node:assert/strict";
import { test } from "node:test";
import { emptySession, sessionData } from "./session.js";

test("recovery payload validates anchors and rejects unbounded drafts", () => {
  assert.equal(sessionData.safeParse(emptySession()).success, true);
  assert.equal(
    sessionData.safeParse({
      ...emptySession(),
      pending: [
        {
          id: "1",
          path: "a.ts",
          line: 0,
          side: "RIGHT",
          body: "fix",
          headSha: "a".repeat(40),
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    sessionData.safeParse({
      ...emptySession(),
      textDrafts: { summary: "x".repeat(65_001) },
    }).success,
    false,
  );
});
