import assert from "node:assert/strict";
import { test } from "node:test";
import { answerStillValid } from "./checklist";
test("unchanged files preserve checks; changes, renames and global questions require another check", () => {
  const answer = { headSha: "old", files: { "auth.ts": "blob" } };
  assert.equal(
    answerStillValid(answer, ["auth.ts"], "new", { "auth.ts": "blob" }, true),
    true,
  );
  assert.equal(
    answerStillValid(
      answer,
      ["auth.ts"],
      "new",
      { "auth.ts": "changed" },
      true,
    ),
    false,
  );
  assert.equal(
    answerStillValid(answer, ["auth.ts"], "new", { "login.ts": "blob" }, true),
    false,
  );
  assert.equal(answerStillValid(answer, [], "new", {}, true), false);
  assert.equal(
    answerStillValid(answer, ["auth.ts"], "new", { "auth.ts": "blob" }, false),
    false,
  );
});
