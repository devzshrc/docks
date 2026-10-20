import assert from "node:assert/strict";
import { test } from "node:test";
import { publish, subscribeLocal, useLivePublisher, type LiveEvent } from "./live.js";

test("local hub: workspace-wide and per-user delivery, unsubscribe", async () => {
  const got: Record<string, LiveEvent[]> = { a: [], b: [], other: [] };
  const offA = subscribeLocal("w1", "a", (e) => got.a!.push(e));
  subscribeLocal("w1", "b", (e) => got.b!.push(e));
  subscribeLocal("w2", "a", (e) => got.other!.push(e));
  await publish("w1", { t: "pr" });
  await publish("w1", { t: "inbox" }, "b");
  offA();
  await publish("w1", { t: "release" });
  assert.deepEqual(got.a, [{ t: "pr" }]);
  assert.deepEqual(got.b, [{ t: "pr" }, { t: "inbox" }, { t: "release" }]);
  assert.deepEqual(got.other, []);
});

test("a failing publisher never throws into the caller", async () => {
  useLivePublisher(async () => {
    throw new Error("hub down");
  });
  try {
    await publish("w1", { t: "pr" });
  } finally {
    useLivePublisher(undefined);
  }
});
