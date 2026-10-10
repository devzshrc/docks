import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { db, schema, closeDb } from "@docks/db";
import { eq, inArray } from "drizzle-orm";
import { completeJob, enqueue } from "./jobs.js";
import { withLogContext } from "./logger.js";
import { operationalHealth } from "./operational-health.js";
import { purgeDiagnostics } from "./observability-maintenance.js";

test(
  "queue correlation, terminal timestamps, and bounded diagnostic retention",
  { skip: !process.env.DOCKS_TEST_DATABASE_URL },
  async () => {
    assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
    assert.match(process.env.DATABASE_URL!, /test/);
    const marker = randomUUID();
    const jobIds: number[] = [];
    const old = new Date(Date.now() - 400 * 86400000);
    try {
      await withLogContext({ requestId: marker }, () =>
        enqueue("sync_repo", { fixture: marker }),
      );
      const [job] = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.requestId, marker));
      assert.ok(job);
      jobIds.push(job.id);
      await db
        .update(schema.jobs)
        .set({ updatedAt: old })
        .where(eq(schema.jobs.id, job.id));
      await completeJob(job.id);
      const [done] = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, job.id));
      assert.ok(done!.updatedAt.getTime() > old.getTime());
      const [future] = await db
        .insert(schema.jobs)
        .values({
          type: "sync_repo",
          payload: {},
          runAfter: new Date(Date.now() + 86400000),
          requestId: marker,
        })
        .returning();
      jobIds.push(future!.id);
      const snapshot = await operationalHealth();
      // Other tests may enqueue jobs concurrently; this fixture's future job never defines oldest ready age.
      assert.notEqual(
        snapshot.queue.oldestReadyAt &&
          new Date(snapshot.queue.oldestReadyAt).getTime(),
        future!.runAfter.getTime(),
      );
      await db
        .insert(schema.serverError)
        .values({
          hash: marker,
          message: "retention fixture",
          firstAt: old,
          lastAt: old,
        });
      await db
        .insert(schema.aiCall)
        .values({
          id: marker,
          operation: "ask",
          model: "fixture",
          outcome: "ok",
          latencyMs: 1,
          at: old,
        });
      await purgeDiagnostics();
      assert.equal(
        (
          await db
            .select()
            .from(schema.serverError)
            .where(eq(schema.serverError.hash, marker))
        ).length,
        0,
      );
      assert.equal(
        (
          await db
            .select()
            .from(schema.aiCall)
            .where(eq(schema.aiCall.id, marker))
        ).length,
        0,
      );
      assert.equal(
        (await db.select().from(schema.jobs).where(eq(schema.jobs.id, job.id)))
          .length,
        1,
      );
    } finally {
      if (jobIds.length)
        await db.delete(schema.jobs).where(inArray(schema.jobs.id, jobIds));
      await db
        .delete(schema.serverError)
        .where(eq(schema.serverError.hash, marker));
      await db.delete(schema.aiCall).where(eq(schema.aiCall.id, marker));
      await closeDb();
    }
  },
);
