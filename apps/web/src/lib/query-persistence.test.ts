import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import superjson from "superjson";
import { persistListQuery, queryCacheKey } from "./query-persistence";

test("persisted query caches are isolated by API, person, and login session", () => {
  const keys = [
    queryCacheKey("api", "alice", "1"),
    queryCacheKey("api", "bob", "1"),
    queryCacheKey("other", "alice", "1"),
    queryCacheKey("api", "alice", "2"),
  ];
  assert.equal(new Set(keys).size, keys.length);
});
test("list persistence preserves dates and excludes code, permissions, AI and admin data", () => {
  const client = new QueryClient();
  const at = new Date("2026-10-20T08:00:00Z");
  client.setQueryData(
    [["review", "board"], { input: { workspaceId: "a" }, type: "query" }],
    { at },
  );
  client.setQueryData([["workspace", "list"], { type: "query" }], {
    workspaces: [{ id: "a" }],
  });
  client.setQueryData(
    [["workspace", "repos"], { input: { workspaceId: "a" }, type: "query" }],
    { repos: [{ id: 1, fullName: "demo/web" }] },
  );
  for (const path of [
    ["review", "get"],
    ["review", "fileContent"],
    ["review", "questions"],
    ["workspace", "settings"],
    ["admin", "users"],
  ])
    client.setQueryData([path], { private: true });
  const saved = superjson.stringify(
    dehydrate(client, { shouldDehydrateQuery: persistListQuery }),
  );
  const restored = new QueryClient();
  hydrate(restored, superjson.parse(saved));
  assert.equal(restored.getQueryCache().getAll().length, 3);
  assert.deepEqual(
    restored.getQueryData([
      ["review", "board"],
      { input: { workspaceId: "a" }, type: "query" },
    ]),
    { at },
  );
  assert.equal(
    persistListQuery({
      queryKey: [["review", "board"]],
      state: { status: "error" },
    }),
    false,
  );
  client.clear();
  restored.clear();
});
