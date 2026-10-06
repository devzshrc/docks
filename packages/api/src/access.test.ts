import assert from "node:assert/strict";
import { test } from "node:test";
import { ROLES } from "@docks/db";
import { CAN, can } from "./access.js";

test("owners can do everything", () => {
  for (const action of Object.keys(CAN) as (keyof typeof CAN)[]) assert.ok(can("owner", action), action);
});

test("viewers can't act on reviews or manage anything", () => {
  for (const action of Object.keys(CAN) as (keyof typeof CAN)[]) assert.equal(can("viewer", action), false, action);
});

test("role boundaries", () => {
  assert.ok(can("member", "review.act"));
  assert.equal(can("member", "repos.manage"), false);
  assert.ok(can("admin", "members.manage"));
  assert.equal(can("admin", "billing.manage"), false, "admins don't touch billing");
  assert.equal(can("admin", "workspace.delete"), false, "only owners delete");
  assert.ok(can("billing", "billing.manage"));
  assert.equal(can("billing", "members.manage"), false);
});

test("every action lists only known roles", () => {
  for (const roles of Object.values(CAN)) for (const r of roles) assert.ok(ROLES.includes(r), r);
});
