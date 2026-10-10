import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { db, schema, closeDb } from "@docks/db";
import { eq, ilike } from "drizzle-orm";
import { recordServerError } from "./observe.js";
import { RetryJobAtError, failJob } from "./jobs.js";
import { appRouter } from "./routers/_app.js";

/**
 * Letters outside [0-9a-f] so the tag survives error-message normalization
 * (digits/hex/uuids are stripped for grouping).
 */
const SAFE = "ghjkmnpqrstuvwxyz";
const tag = (n = 10) =>
  Array.from(
    { length: n },
    () => SAFE[Math.floor(Math.random() * SAFE.length)],
  ).join("");

test(
  "server_error grouping, caps, job wiring and admin.errors",
  { skip: !process.env.DOCKS_TEST_DATABASE_URL },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
    assert.match(
      process.env.DATABASE_URL!,
      /test/,
      "Use a disposable test database",
    );
    const prefix = randomUUID();
    const run = tag();
    const people = ["owner", "member"].map((role) => ({
      id: `${prefix}-${role}`,
      name: role,
      email: `${prefix}-${role}@example.test`,
      emailVerified: true,
      image: null,
      twoFactorEnabled: true,
    }));
    process.env.ADMIN_EMAILS = people[0]!.email;
    const caller = (i: number) =>
      appRouter.createCaller({ user: people[i]!, requestId: prefix });
    const owner = caller(0);
    const member = caller(1);
    const jobIds: number[] = [];
    try {
      await db.insert(schema.user).values(people);

      await t.test("same bug upserts one row, total increments", async () => {
        await recordServerError(
          new Error(`${run} connection refused on port 5432`),
        );
        await recordServerError(
          new Error(`${run} connection refused on port 9999`),
        );
        const rows = await db
          .select()
          .from(schema.serverError)
          .where(
            ilike(schema.serverError.message, `%${run} connection refused%`),
          );
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.total, 2);
        assert.ok(rows[0]!.firstAt <= rows[0]!.lastAt);
      });

      await t.test(
        "different bugs get different rows; input is capped",
        async () => {
          await recordServerError(`${run} short and distinct failure`);
          await recordServerError(`${run} ${"y".repeat(5000)}`);
          const rows = await db
            .select()
            .from(schema.serverError)
            .where(ilike(schema.serverError.message, `%${run}%`));
          assert.ok(rows.length >= 3);
          for (const r of rows) assert.ok(r.message.length <= 1000);
        },
      );

      await t.test("recording never throws on hostile input", async () => {
        await recordServerError(null);
        await recordServerError(undefined);
        await recordServerError("");
      });

      await t.test(
        "failJob records a grouped error without breaking the update",
        async () => {
          const [job] = await db
            .insert(schema.jobs)
            .values({ type: "sync_repo", payload: {} })
            .returning();
          jobIds.push(job!.id);
          await failJob(job!, new Error(`${run} sync exploded`));
          const [updated] = await db
            .select()
            .from(schema.jobs)
            .where(eq(schema.jobs.id, job!.id));
          assert.equal(updated!.status, "queued");
          assert.match(updated!.lastError!, new RegExp(`${run} sync exploded`));
          const rows = await db
            .select()
            .from(schema.serverError)
            .where(ilike(schema.serverError.message, `%${run} sync exploded%`));
          assert.equal(rows.length, 1);
          assert.match(rows[0]!.message, /^\[job sync_repo#/);
        },
      );

      await t.test("deferred jobs are not errors", async () => {
        const [job] = await db
          .insert(schema.jobs)
          .values({ type: "sync_repo", payload: {} })
          .returning();
        jobIds.push(job!.id);
        const marker = `${run} deferred marker`;
        await failJob(job!, new RetryJobAtError(new Date(Date.now() + 60000)));
        const rows = await db
          .select()
          .from(schema.serverError)
          .where(ilike(schema.serverError.message, `%${marker}%`));
        assert.equal(rows.length, 0);
      });

      await t.test(
        "admin.errors is admin-only with search and 25-row pages",
        async () => {
          await assert.rejects(
            appRouter
              .createCaller({ user: null, requestId: prefix })
              .admin.errors({}),
            /Not authenticated/,
          );
          await assert.rejects(member.admin.errors({}), /Not found/);
          for (let i = 0; i < 30; i++) {
            const a = SAFE[i % SAFE.length]!;
            const b = SAFE[Math.floor(i / SAFE.length) % SAFE.length]!;
            await recordServerError(`${run} paging failure ${a}${b}`);
          }
          const first = await owner.admin.errors({ search: run, limit: 25 });
          assert.equal(first.total >= 32, true);
          assert.equal(first.rows.length, 25);
          const second = await owner.admin.errors({
            search: run,
            limit: 25,
            offset: 25,
          });
          assert.ok(second.rows.length >= 7);
          const hashes = new Set(
            [...first.rows, ...second.rows].map((r) => r.hash),
          );
          assert.equal(hashes.size, first.total);
          const one = await owner.admin.errors({
            search: `${run} paging failure ${SAFE[0]}${SAFE[0]}`,
          });
          assert.equal(one.total, 1);
        },
      );

      await t.test("full stacks live only in admin.errors", async () => {
        const marker = `${run} stackmarker`;
        const err = new Error(`${marker} boom`);
        err.stack = `${marker}: boom\n    at fixture (${run}.ts:1:1)`;
        await recordServerError(err);
        const found = await owner.admin.errors({ search: marker });
        assert.equal(found.total, 1);
        assert.match(found.rows[0]!.stack!, new RegExp(marker));
        const health = await owner.admin.health({});
        assert.ok(!JSON.stringify(health).includes(marker));
      });
    } finally {
      await db
        .delete(schema.serverError)
        .where(ilike(schema.serverError.message, `%${run}%`));
      await db
        .delete(schema.serverError)
        .where(eq(schema.serverError.message, "Unknown error"));
      for (const id of jobIds)
        await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
      for (const p of people)
        await db.delete(schema.user).where(eq(schema.user.id, p.id));
      await closeDb();
    }
  },
);
