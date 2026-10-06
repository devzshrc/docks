import assert from "node:assert/strict";
import { test } from "node:test";
import { globToRegex, ownersFor, parseCodeowners, rankReviewers, type Candidate } from "./reviewers.js";

test("CODEOWNERS globs", () => {
  assert.ok(globToRegex("*.js").test("src/app/index.js"), "bare glob matches any depth");
  assert.ok(!globToRegex("/*.js").test("src/index.js"), "anchored glob is root-only");
  assert.ok(globToRegex("/docs/").test("docs/a/b.md"), "directory covers everything below");
  assert.ok(globToRegex("apps/**/test/*").test("apps/web/src/test/x.ts"));
  assert.ok(!globToRegex("apps/*/x.ts").test("apps/a/b/x.ts"), "single star doesn't cross folders");
  assert.ok(globToRegex("src/payments").test("src/payments/charge.ts"));
});

test("last matching CODEOWNERS rule wins; teams are skipped", () => {
  const rules = parseCodeowners(`
# comment
*            @Alice
/src/db/     @bob @acme/platform
src/db/x.ts  @carol   # inline comment
`);
  assert.deepEqual(ownersFor(rules, "README.md"), ["alice"]);
  assert.deepEqual(ownersFor(rules, "src/db/schema.ts"), ["bob"]);
  assert.deepEqual(ownersFor(rules, "src/db/x.ts"), ["carol"]);
});

const c = (login: string, extra: Partial<Candidate> = {}): Candidate => ({
  userId: login,
  login,
  name: login,
  away: false,
  openReviews: 0,
  maxOpenReviews: null,
  expertise: [],
  ...extra,
});

test("ranking: code owner > expertise > history > load; skips author, away, already requested", () => {
  const ranked = rankReviewers(
    [
      c("author"),
      c("away", { away: true, expertise: ["payments"] }),
      c("owner", { openReviews: 3 }),
      c("expert", { expertise: ["payments"] }),
      c("historian"),
      c("idle"),
      c("requested", { expertise: ["payments"] }),
    ],
    {
      author: "Author",
      paths: ["src/payments/charge.ts"],
      codeowners: new Set(["owner"]),
      folderReviews: new Map([["historian", 2]]),
      exclude: new Set(["requested"]),
    },
  );
  assert.deepEqual(
    ranked.map((r) => r.login),
    ["owner", "expert", "historian", "idle"],
  );
  assert.deepEqual(ranked[1]!.reasons, ["knows payments"]);
});

test("people at their review limit go last, flagged", () => {
  const ranked = rankReviewers([c("full", { openReviews: 2, maxOpenReviews: 2, expertise: ["db"] }), c("free")], {
    author: "x",
    paths: ["db/schema.sql"],
    codeowners: new Set(),
    folderReviews: new Map(),
  });
  assert.deepEqual(ranked.map((r) => [r.login, r.atLimit]), [["free", false], ["full", true]]);
});
