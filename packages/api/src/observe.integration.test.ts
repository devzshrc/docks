import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { db, schema, closeDb } from "@docks/db";
import { write_event } from "./observe.js";

test(
  "observe.write_event inserts one row and never throws",
  { skip: !process.env.DOCKS_TEST_DATABASE_URL },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
    assert.match(
      process.env.DATABASE_URL!,
      /test/,
      "Use a disposable test database",
    );
    const prefix = randomUUID();
    const name = `observe_fixture_${prefix}`;
    const userId = `${prefix}-user`;
    try {
      await t.test("inserts one row into the given table", async () => {
        await write_event(schema.event, {
          userId,
          workspaceId: null,
          name,
          props: { key: prefix },
        });
        const rows = await db
          .select()
          .from(schema.event)
          .where(eq(schema.event.name, name));
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.userId, userId);
      });

      await t.test("a failed insert is logged, never thrown", async () => {
        const logged: string[] = [];
        const orig = console.error;
        console.error = (...args: unknown[]) => {
          logged.push(args.map(String).join(" "));
        };
        try {
          await write_event(schema.event, {
            userId: null,
            workspaceId: null,
            name: null as unknown as string,
          });
        } finally {
          console.error = orig;
        }
        assert.ok(logged.length >= 1, "expected a console.error on failure");
        assert.match(logged[0]!, /\[observe\]/);
      });
    } finally {
      await db.delete(schema.event).where(eq(schema.event.userId, userId));
      await closeDb();
    }
  },
);
