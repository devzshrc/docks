import assert from "node:assert/strict";
import { test } from "node:test";
import {
  branchName,
  cleanTitle,
  compileBody,
  extractTraceRefs,
  fuzzyScore,
  indexTree,
  keywords,
  missingRequired,
  parseMdTemplate,
  permalink,
  resolvePath,
  unapplied,
} from "./issue.js";

const tree = indexTree(["src/auth/login.ts", "src/auth/session.ts", "src/utils/index.ts", "web/utils/index.ts", "pkg/main.go", "src/lib.rs", "app/Foo.java", "docs/my notes.md"]);

test("sections compile to Markdown, skipping empty optional ones", () => {
  const body = compileBody("bug", { what: "Login fails", steps: "1. Open\n2. Click", env: "  " }, [
    { path: "src/auth/login.ts", line: 12, url: "https://github.com/o/r/blob/abc/src/auth/login.ts#L12" },
  ]);
  assert.match(body, /^## What happened\n\nLogin fails\n\n## Steps to reproduce/);
  assert.ok(!body.includes("Environment"));
  assert.match(body, /## Code references\n\n- \[`src\/auth\/login.ts:12`\]\(https:\/\/github.com\/o\/r\/blob\/abc\/src\/auth\/login.ts#L12\)/);
  assert.deepEqual(missingRequired("bug", { what: "x" }), ["Steps to reproduce"]);
  assert.deepEqual(missingRequired("task", { description: "do it" }), []);
});

test("markdown issue templates: front matter and body", () => {
  const t = parseMdTemplate("bug_report.md", `---\nname: Bug report\nabout: Something broke\nlabels: [bug, "needs triage"]\nassignees: octocat\n---\n\n## Describe\n`);
  assert.equal(t.name, "Bug report");
  assert.deepEqual(t.labels, ["bug", "needs triage"]);
  assert.deepEqual(t.assignees, ["octocat"]);
  assert.equal(t.body, "## Describe");
  assert.equal(parseMdTemplate("plain_template.md", "Just text").name, "plain template");
});

test("titles are one line and capped; branch names are slugged", () => {
  assert.equal(cleanTitle("  a\n  b\t c "), "a b c");
  assert.equal(cleanTitle("x".repeat(400)).length, 256);
  assert.equal(branchName("bug", 123, "Login fails behind a proxy!"), "fix/123-login-fails-behind-a-proxy");
  assert.equal(branchName("feature", 7, "!!!"), "feat/7");
  assert.ok(branchName("task", 1, "word ".repeat(30)).length <= 50);
});

test("duplicate-search keywords drop filler words", () => {
  assert.deepEqual(keywords("Login is not working behind the proxy"), ["login", "behind", "proxy"]);
  assert.deepEqual(keywords("a to of"), []);
  assert.equal(keywords("alpha beta gamma delta epsilon zeta eta theta").length, 6);
});

test("stack traces: JS, Python, Go, Java, Rust", () => {
  const refs = (s: string) => extractTraceRefs(s).map((r) => `${r.path}:${r.line}`);
  assert.deepEqual(refs("TypeError: x\n    at login (/home/u/app/src/auth/login.ts:42:13)\n    at async handler (webpack-internal:///./src/auth/session.ts:9:3)"), [
    "/home/u/app/src/auth/login.ts:42",
    "src/auth/session.ts:9",
  ]);
  assert.deepEqual(refs('  File "/srv/app/pkg/tool.py", line 88, in run'), ["/srv/app/pkg/tool.py:88"]);
  assert.deepEqual(refs("goroutine 1:\n\t/work/pkg/main.go:17 +0x1d"), ["/work/pkg/main.go:17"]);
  assert.deepEqual(refs("at com.x.Foo.run(Foo.java:55)"), ["Foo.java:55"]);
  assert.deepEqual(refs("error[E0308]\n --> src/lib.rs:4:9"), ["src/lib.rs:4"]);
  assert.deepEqual(refs("at x (/app/node_modules/lib/index.js:1:1)"), []);
  assert.deepEqual(refs("connect to localhost:3000 failed"), []);
});

test("trace paths resolve to real files, or nothing when ambiguous", () => {
  assert.equal(resolvePath("/home/u/app/src/auth/login.ts", tree), "src/auth/login.ts");
  assert.equal(resolvePath("src/auth/login.ts", tree), "src/auth/login.ts");
  assert.equal(resolvePath("auth/login.ts", tree), "src/auth/login.ts");
  assert.equal(resolvePath("Foo.java", tree), "app/Foo.java");
  assert.equal(resolvePath("/x/y/index.ts", tree), null); // src/utils and web/utils both match
  assert.equal(resolvePath("/x/utils/index.ts", tree), null);
  assert.equal(resolvePath("/x/src/utils/index.ts", tree), "src/utils/index.ts");
  assert.equal(resolvePath("nope.ts", tree), null);
});

test("permalinks encode each path segment", () => {
  assert.equal(permalink("o/r", "abc", "docs/my notes.md", 3), "https://github.com/o/r/blob/abc/docs/my%20notes.md#L3");
});

test("reports labels and assignees GitHub didn't apply", () => {
  assert.deepEqual(unapplied({ labels: ["Bug", "p1"], assignees: ["dana", "raj"] }, { labels: ["bug"], assignees: ["Dana"] }), { labels: ["p1"], assignees: ["raj"] });
});

test("file-level references link without a line", () => {
  assert.equal(permalink("o/r", "abc", "src/a.ts", 0), "https://github.com/o/r/blob/abc/src/a.ts");
  assert.match(compileBody("task", {}, [{ path: "src/a.ts", line: 0, url: "u" }]), /- \[`src\/a.ts`\]\(u\)/);
});

test("fuzzy file search prefers file-name hits", () => {
  assert.ok(fuzzyScore("fd", "src/file-diff.tsx")! > fuzzyScore("fd", "src/foo/bar/d.ts")!);
  assert.equal(fuzzyScore("xyz", "a.ts"), null);
});
