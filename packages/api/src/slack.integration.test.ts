import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { closeDb, db, schema } from "@docks/db";
import { and, eq, sql } from "drizzle-orm";
import { encrypt } from "./crypto.js";
import { PermanentJobError } from "./jobs.js";
import { digestText, scheduleDigests, sendDigest, sendTestDigest } from "./slack.js";

process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

test("Slack digest content, local-hour scheduling and delivery", { skip: !process.env.DOCKS_TEST_DATABASE_URL }, async (t) => {
  assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
  const id = randomUUID();
  const base = Date.now() % 1_000_000_000;
  const hook = `https://hooks.slack.test/${id}`;
  const posts: string[] = [];
  let status = 200;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url) !== hook) return realFetch(url, init);
    posts.push(JSON.parse(String(init!.body)).text);
    return new Response(status === 200 ? "ok" : "gone", { status });
  }) as typeof fetch;
  const digestJobs = () =>
    db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.type, "slack_digest"), sql`${schema.jobs.payload}->>'workspaceId' = ${id}`));
  t.after(async () => {
    globalThis.fetch = realFetch;
    await db.delete(schema.jobs).where(and(eq(schema.jobs.type, "slack_digest"), sql`${schema.jobs.payload}->>'workspaceId' = ${id}`));
    await db.delete(schema.workspace).where(eq(schema.workspace.id, id));
    await closeDb();
  });

  await db.insert(schema.workspace).values({ id, name: "Slack", slug: id, stuckHours: 24 });
  await db.insert(schema.githubInstallation).values({ id: base, workspaceId: id, accountLogin: "o", accountType: "Organization" });
  await db.insert(schema.repository).values({ id: base, installationId: base, fullName: `o/${id}`, defaultBranch: "main" });
  const pr = (number: number, hoursIdle: number, extra: Partial<typeof schema.pullRequest.$inferInsert> = {}) => ({
    repoId: base,
    number,
    title: `PR <${number}> & co`,
    authorLogin: "author",
    state: "open" as const,
    headRef: "f",
    headSha: "a".repeat(40),
    baseRef: "main",
    reviewColumn: "waiting" as const,
    requestedReviewers: ["ana"],
    lastActivityAt: new Date(Date.now() - hoursIdle * 3_600_000),
    ...extra,
  });

  await t.test("nothing stuck means no digest text", async () => {
    await db.insert(schema.pullRequest).values(pr(1, 2));
    assert.equal(await digestText(id), null);
  });

  await t.test("digest lists stuck PRs oldest first, escaped, skipping drafts and approved", async () => {
    await db.insert(schema.pullRequest).values([
      pr(2, 30),
      pr(3, 80, { requestedReviewers: [], reviewColumn: "needs_reviewer" }),
      pr(4, 90, { draft: true }),
      pr(5, 90, { reviewColumn: "approved" }),
    ]);
    const text = (await digestText(id))!;
    const lines = text.split("\n");
    assert.equal(lines[0], "*2 PRs waiting more than 24h*");
    assert.match(lines[1]!, /#3>.*needs a reviewer, 3d$/);
    assert.match(lines[2]!, /#2> PR &lt;2&gt; &amp; co — waiting on ana, 30h$/);
  });

  await t.test("scheduling waits for the local digest hour and queues once per day", async () => {
    await db.insert(schema.slackIntegration).values({
      workspaceId: id,
      teamId: "T",
      teamName: "Team",
      channelId: "C",
      channelName: "reviews",
      webhookUrlEncrypted: encrypt(hook),
      digestHour: 9,
      timezone: "Asia/Kolkata",
    });
    await scheduleDigests(new Date("2026-10-20T03:00:00Z")); // 08:30 in Kolkata
    assert.equal((await digestJobs()).length, 0);
    await scheduleDigests(new Date("2026-10-20T03:45:00Z")); // 09:15
    await scheduleDigests(new Date("2026-10-20T04:00:00Z"));
    const jobs = await digestJobs();
    assert.equal(jobs.length, 1);
    assert.deepEqual(jobs[0]!.payload, { workspaceId: id, date: "2026-10-20" });
  });

  await t.test("sendDigest posts once per date", async () => {
    await sendDigest(id, "2026-10-20");
    await sendDigest(id, "2026-10-20");
    assert.equal(posts.length, 1);
    assert.match(posts[0]!, /2 PRs waiting/);
    await scheduleDigests(new Date("2026-10-20T10:00:00Z"));
    assert.equal((await digestJobs()).length, 1, "a sent day isn't queued again");
  });

  await t.test("a revoked webhook fails permanently; the test digest still reports", async () => {
    status = 410;
    await assert.rejects(sendDigest(id, "2026-10-21"), (err) => err instanceof PermanentJobError);
    status = 200;
    await db.update(schema.pullRequest).set({ draft: true }).where(eq(schema.pullRequest.repoId, base));
    await sendTestDigest(id);
    assert.equal(posts.at(-1), "No PRs are stuck waiting for review. Nice.");
  });
});
