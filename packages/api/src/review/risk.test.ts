import assert from "node:assert/strict";
import { test } from "node:test";
import { tierOf } from "./risk.js";

test("source under a build/ folder is core, not generated", () => {
  // Regression: astro's only real change in PR #18176 was hidden as noise.
  assert.equal(tierOf("packages/astro/src/core/build/plugins/plugin-css.ts"), "core");
  assert.equal(tierOf("build/release-adapter.ts"), "core");
});

test("output and lockfiles are noise", () => {
  for (const p of ["pnpm-lock.yaml", "go.sum", "packages/x/dist/index.js", "a/b.min.js", "drizzle/meta/_journal.json"]) {
    assert.equal(tierOf(p), "noise", p);
  }
});

test("tests in Go, Python, Ruby, JVM and JS are test", () => {
  for (const p of [
    "context_test.go",
    "tests/test_translate.py",
    "app/models_test.py",
    "spec/user_spec.rb",
    "src/test/java/FooTest.java",
    "src/a.test.ts",
    "src/__tests__/b.tsx",
  ]) {
    assert.equal(tierOf(p), "test", p);
  }
});

test("config and core", () => {
  assert.equal(tierOf("package.json"), "config");
  assert.equal(tierOf(".github/workflows/ci.yml"), "config");
  assert.equal(tierOf("src/server/router.ts"), "core");
  assert.equal(tierOf("scripts/translate.py"), "core");
});
