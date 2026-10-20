import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRepoRules, rulesChecklist, tierWithRules } from "./repo-rules.js";

const yaml = `
tiers:
  core: ["services/*/src/**"]
  noise: ["**/*.pb.go", "web/public/"]
  test: ["**/testdata/**"]
checklist:
  - paths: ["**/migrations/**"]
    question: "Does this migration handle existing rows?"
`;

test("parseRepoRules accepts a valid file and rejects bad ones with a reason", () => {
  const ok = parseRepoRules(yaml);
  assert.ok("rules" in ok);
  assert.deepEqual(ok.rules.tiers.core, ["services/*/src/**"]);
  assert.deepEqual(parseRepoRules(""), { rules: { tiers: {}, checklist: [] } });
  const bad = parseRepoRules("tiers:\n  important: [x]");
  assert.ok("error" in bad && /tiers/.test(bad.error));
  const broken = parseRepoRules("tiers: [unclosed");
  assert.ok("error" in broken && /YAML/.test(broken.error));
});

test("tierWithRules: repo rules win, most specific tier first, defaults otherwise", () => {
  const { rules } = parseRepoRules(yaml) as { rules: NonNullable<Parameters<typeof tierWithRules>[1]> };
  assert.equal(tierWithRules("api/user.pb.go", rules), "noise");
  assert.equal(tierWithRules("web/public/logo.txt", rules), "noise");
  assert.equal(tierWithRules("testdata/case.json", rules), "test", "**/ also matches at the root");
  assert.equal(tierWithRules("pkg/x/testdata/a.json", rules), "test");
  assert.equal(tierWithRules("services/auth/src/login.ts", rules), "core");
  assert.equal(tierWithRules("package.json", rules), "config", "falls back to built-in tiers");
  assert.equal(tierWithRules("package.json", null), "config");
});

test("rulesChecklist only returns questions whose paths changed", () => {
  const { rules } = parseRepoRules(yaml) as { rules: NonNullable<Parameters<typeof tierWithRules>[1]> };
  assert.deepEqual(rulesChecklist(rules, ["db/migrations/0042.sql"]), ["Does this migration handle existing rows?"]);
  assert.deepEqual(rulesChecklist(rules, ["src/a.ts"]), []);
});
