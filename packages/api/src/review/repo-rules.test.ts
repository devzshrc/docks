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

test("starterRulesYaml suggests only rules that match the repo, and parses", async () => {
  const { starterRulesYaml } = await import("./repo-rules.js");
  const yaml = starterRulesYaml([
    "packages/api/src/index.ts",
    "apps/web/src/page.tsx",
    "packages/db/drizzle/0001.sql",
    "proto/gen/user.pb.go",
    "infra/main.tf",
    "src/auth/login.ts",
    "tests/fixtures/a.json",
    ".github/workflows/ci.yml",
    "README.md",
  ]);
  const parsed = parseRepoRules(yaml);
  assert.ok("rules" in parsed, yaml);
  assert.deepEqual(parsed.rules.tiers.core, ["packages/*/src/**", "apps/*/src/**"].sort((a, b) => (yaml.indexOf(a) - yaml.indexOf(b))));
  assert.ok(parsed.rules.tiers.noise!.includes("proto/gen/"));
  assert.ok(parsed.rules.tiers.noise!.includes("**/*.pb.go"));
  assert.deepEqual(parsed.rules.tiers.config, ["infra/"]);
  assert.deepEqual(parsed.rules.tiers.test, ["tests/fixtures/"]);
  assert.deepEqual(parsed.rules.checklist.map((c) => c.paths[0]), ["packages/db/drizzle/", "src/auth/", ".github/workflows/"]);
  // A plain repo still gets a valid, empty file.
  assert.ok("rules" in parseRepoRules(starterRulesYaml(["index.js"])));
});
