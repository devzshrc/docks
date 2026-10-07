import assert from "node:assert/strict";
import { test } from "node:test";
import type { RoutingRule } from "@docks/db";
import { dueRules, globToRegExp, issueRules, ruleMatches } from "./rules.js";

const rule = (r: Partial<RoutingRule>): RoutingRule => ({
  id: "r",
  paths: [],
  minLines: null,
  label: null,
  teamId: null,
  reviewers: [],
  comment: null,
  ...r,
});

test("globs: folders, wildcards and bare file patterns", () => {
  assert.ok(globToRegExp("billing/").test("billing/plans.ts"));
  assert.ok(globToRegExp("billing/**").test("billing/a/b/c.ts"));
  assert.ok(!globToRegExp("billing/**").test("src/billing/a.ts"));
  assert.ok(globToRegExp("**/billing/**").test("src/billing/a.ts"));
  assert.ok(globToRegExp("*.sql").test("db/migrations/001.sql"));
  assert.ok(!globToRegExp("src/*.ts").test("src/a/b.ts"));
  assert.ok(globToRegExp("package.json").test("apps/web/package.json"));
});

test("a rule needs a condition; path and size conditions combine with AND", () => {
  const pr = { paths: ["billing/plans.ts", "README.md"], lines: 900 };
  assert.equal(ruleMatches(rule({}), pr), false);
  assert.equal(ruleMatches(rule({ paths: ["billing/"] }), pr), true);
  assert.equal(ruleMatches(rule({ minLines: 800 }), pr), true);
  assert.equal(ruleMatches(rule({ minLines: 1000 }), pr), false);
  assert.equal(ruleMatches(rule({ paths: ["billing/"], minLines: 1000 }), pr), false);
  assert.equal(ruleMatches(rule({ paths: ["infra/"], minLines: 800 }), pr), false);
});

test("applied rules don't fire again", () => {
  const rules = [rule({ id: "a", minLines: 10 }), rule({ id: "b", minLines: 10 })];
  assert.deepEqual(dueRules(rules, ["a"], { paths: [], lines: 50 }).map((r) => r.id), ["b"]);
});

test("issues only use path rules", () => {
  const rules = [rule({ id: "a", paths: ["billing/"] }), rule({ id: "b", minLines: 5 }), rule({ id: "c", paths: ["billing/"], minLines: 5 })];
  assert.deepEqual(issueRules(rules, ["billing/plans.ts"]).map((r) => r.id), ["a"]);
  assert.deepEqual(issueRules(rules, ["web/a.ts"]), []);
  assert.deepEqual(issueRules(rules, []), []);
});
