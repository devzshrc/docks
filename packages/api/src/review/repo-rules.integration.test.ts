import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { closeDb, db, schema } from "@docks/db";
import { and, eq } from "drizzle-orm";
import { appRouter } from "../routers/_app.js";
import { GitHubError } from "./github.js";
import { repoRules } from "./repo-rules.js";

test("rules file loading, fallbacks and re-tiering; guide feedback", { skip: !process.env.DOCKS_TEST_DATABASE_URL }, async (t) => {
  assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
  const id = randomUUID();
  const base = Date.now() % 1_000_000_000;
  const fullName = `o/${id}`;
  const sha = "b".repeat(40);
  const user = { id: `${id}-u`, name: "U", email: `${id}@example.test`, emailVerified: true, image: null };
  t.after(async () => {
    await db.delete(schema.workspace).where(eq(schema.workspace.id, id));
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
    await closeDb();
  });
  await db.insert(schema.user).values(user);
  await db.insert(schema.workspace).values({ id, name: "Rules", slug: id });
  await db.insert(schema.workspaceMember).values({ workspaceId: id, userId: user.id, role: "owner" });
  await db.insert(schema.githubInstallation).values({ id: base, workspaceId: id, accountLogin: "o", accountType: "Organization" });
  await db.insert(schema.repository).values({ id: base, installationId: base, fullName, defaultBranch: "main" });
  await db.insert(schema.githubRepoAccess).values({ userId: user.id, repoId: base });
  await db.insert(schema.pullRequest).values({
    repoId: base,
    number: 1,
    title: "PR",
    authorLogin: "a",
    state: "open",
    headRef: "f",
    headSha: sha,
    baseRef: "main",
    reviewColumn: "waiting",
    lastActivityAt: new Date(),
  });
  await db.insert(schema.prFile).values(
    ["gen/api.pb.go", "src/a.ts"].map((path) => ({
      repoId: base,
      prNumber: 1,
      headSha: sha,
      path,
      blobSha: "c".repeat(40),
      status: "modified",
      additions: 1,
      deletions: 0,
      tier: "core" as const,
    })),
  );
  const tierOf = async (path: string) =>
    (await db.select({ tier: schema.prFile.tier }).from(schema.prFile).where(and(eq(schema.prFile.repoId, base), eq(schema.prFile.path, path))))[0]!.tier;

  let file: string | Error = new GitHubError(404, "Not Found");
  const gh = {
    reads: 0,
    fileContent: async () => {
      gh.reads++;
      if (file instanceof Error) throw file;
      return file;
    },
  };
  const now = new Date();

  await t.test("no file: built-in tiers, and the miss is remembered", async () => {
    assert.equal(await repoRules(base, gh, fullName, { now }), null);
    await repoRules(base, gh, fullName, { now });
    assert.equal(gh.reads, 1, "fresh result is reused within the TTL");
  });

  await t.test("a new file re-tiers open PRs' files", async () => {
    file = 'tiers:\n  noise: ["gen/"]\nchecklist:\n  - paths: ["src/"]\n    question: "Is the API change backwards compatible?"';
    const rules = await repoRules(base, gh, fullName, { force: true, now });
    assert.deepEqual(rules?.tiers.noise, ["gen/"]);
    assert.equal(await tierOf("gen/api.pb.go"), "noise");
    assert.equal(await tierOf("src/a.ts"), "core");
  });

  await t.test("a broken edit keeps the last valid rules and records the error", async () => {
    file = "tiers: [oops";
    const rules = await repoRules(base, gh, fullName, { force: true, now });
    assert.deepEqual(rules?.tiers.noise, ["gen/"]);
    const state = await appRouter.createCaller({ requestId: id, user } as never).workspace.repoRules({ repoId: base, testPath: "gen/x.go" });
    assert.match(state.error!, /YAML/);
    assert.equal(state.testTier, "noise");
    assert.equal(await tierOf("gen/api.pb.go"), "noise");
  });

  await t.test("a GitHub outage keeps the stored rules", async () => {
    file = new GitHubError(502, "Bad gateway");
    assert.deepEqual((await repoRules(base, gh, fullName, { force: true, now }))?.tiers.noise, ["gen/"]);
  });

  await t.test("deleting the file goes back to built-in tiers", async () => {
    file = new GitHubError(404, "Not Found");
    assert.equal(await repoRules(base, gh, fullName, { force: true, now }), null);
    assert.equal(await tierOf("gen/api.pb.go"), "core");
  });

  await t.test("guide feedback: vote, change, clear; scoped to the commit", async () => {
    const caller = appRouter.createCaller({ requestId: id, user } as never);
    const key = { repo: fullName, number: 1, headSha: sha };
    await caller.review.guideFeedback({ ...key, item: "step:0", vote: 1 });
    await caller.review.guideFeedback({ ...key, item: "check:2", vote: -1 });
    await caller.review.guideFeedback({ ...key, item: "step:0", vote: -1 });
    assert.deepEqual(await caller.review.guideVotes(key), { "step:0": -1, "check:2": -1 });
    await caller.review.guideFeedback({ ...key, item: "check:2", vote: 0 });
    assert.deepEqual(await caller.review.guideVotes(key), { "step:0": -1 });
    assert.deepEqual(await caller.review.guideVotes({ ...key, headSha: "d".repeat(40) }), {});
    await assert.rejects(caller.review.guideFeedback({ ...key, item: "nonsense", vote: 1 }));
  });
});
