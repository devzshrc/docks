import assert from "node:assert/strict";
import { test } from "node:test";
import { cached, useKv } from "./cache.js";

const fakeKv = () => {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null),
    put: async (k: string, v: string) => void store.set(k, v),
  };
};

test("loads once, then serves from memory", async () => {
  useKv(undefined);
  let loads = 0;
  const load = async () => ++loads;
  assert.equal(await cached("t:mem", 60_000, load), 1);
  assert.equal(await cached("t:mem", 60_000, load), 1);
  assert.equal(loads, 1);
});

test("shares through KV and skips it for short or local entries", async () => {
  const kv = fakeKv();
  useKv(kv);
  await cached("t:kv", 5 * 60_000, async () => ["a"]);
  assert.ok(kv.store.has("c:t:kv"));
  await cached("t:short", 30_000, async () => 1);
  await cached("t:local", 5 * 60_000, async () => 1, { local: true });
  assert.deepEqual([...kv.store.keys()], ["c:t:kv"]);
  useKv(undefined);
});

test("a KV failure never fails the request", async () => {
  useKv({ get: async () => { throw new Error("kv down"); }, put: async () => { throw new Error("kv down"); } });
  assert.equal(await cached("t:down", 5 * 60_000, async () => 7), 7);
  useKv(undefined);
});
