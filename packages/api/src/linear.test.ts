import assert from "node:assert/strict";
import { test } from "node:test";
import { createLinearIssue, linearIssues, linearOrg } from "./linear.js";

function withLinear(reply: (body: { query: string; variables: Record<string, unknown> }) => Response) {
  const calls: { auth: string | null; body: { query: string; variables: Record<string, unknown> } }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init!.body));
    calls.push({ auth: new Headers(init!.headers).get("authorization"), body });
    return reply(body);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });

test("personal keys go in the Authorization header as-is; a rejected key says so", async () => {
  const ok = withLinear(() => json({ data: { viewer: { organization: { name: "Acme" } } } }));
  try {
    assert.equal(await linearOrg("lin_api_x"), "Acme");
    assert.equal(ok.calls[0]!.auth, "lin_api_x");
  } finally {
    ok.restore();
  }
  const denied = withLinear(() => json({}, 401));
  try {
    await assert.rejects(linearOrg("bad"), /rejected the API key/);
  } finally {
    denied.restore();
  }
});

test("linearIssues maps found issues and drops unknown ids", async () => {
  const m = withLinear(() =>
    json({
      data: {
        a0: { identifier: "ENG-1", title: "T", url: "u", priorityLabel: "High", state: { name: "Todo", type: "unstarted", color: "#fff" }, assignee: null },
        a1: null,
      },
    }),
  );
  try {
    assert.deepEqual(await linearIssues("k", ["ENG-1", "ENG-404"]), [
      { id: "ENG-1", title: "T", url: "u", state: { name: "Todo", type: "unstarted", color: "#fff" }, assignee: null, priority: "High" },
    ]);
    assert.deepEqual(m.calls[0]!.body.variables, { i0: "ENG-1", i1: "ENG-404" });
    assert.deepEqual(await linearIssues("k", []), []);
    assert.equal(m.calls.length, 1, "no request for an empty list");
  } finally {
    m.restore();
  }
});

test("createLinearIssue surfaces Linear's own error message", async () => {
  const m = withLinear(() => json({ data: { issueCreate: { success: false, issue: null } }, errors: [{ message: "Team not found" }] }));
  try {
    await assert.rejects(createLinearIssue("k", { teamId: "t", title: "x", description: "" }), /Team not found/);
  } finally {
    m.restore();
  }
});
