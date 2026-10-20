import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { db, schema, closeDb } from "@docks/db";
import { eq } from "drizzle-orm";
import { appRouter } from "../routers/_app.js";

test(
  "large PR metadata defers patches and on-demand patches enforce access and revisions",
  { skip: !process.env.DOCKS_TEST_DATABASE_URL },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
    const id = randomUUID();
    const repoId = Date.now();
    const repo = `large/${id}`;
    const user = {
      id,
      name: "Reviewer",
      email: `${id}@example.test`,
      emailVerified: true,
      image: null,
    };
    const sha = "a".repeat(40);
    const patch = "@@ -1 +1 @@\n-old\n+new";
    t.after(async () => {
      await db.delete(schema.prFile).where(eq(schema.prFile.repoId, repoId));
      await db.delete(schema.workspace).where(eq(schema.workspace.id, id));
      await db.delete(schema.user).where(eq(schema.user.id, id));
      await closeDb();
    });
    await db.insert(schema.user).values(user);
    await db
      .insert(schema.workspace)
      .values({ id, name: "Large PR", slug: id });
    await db
      .insert(schema.workspaceMember)
      .values({ workspaceId: id, userId: id, role: "owner" });
    await db.insert(schema.githubInstallation).values({
      id: repoId,
      workspaceId: id,
      accountLogin: "large",
      accountType: "Organization",
    });
    await db.insert(schema.repository).values({
      id: repoId,
      installationId: repoId,
      fullName: repo,
      defaultBranch: "main",
    });
    await db.insert(schema.githubRepoAccess).values({ userId: id, repoId });
    await db.insert(schema.pullRequest).values({
      repoId,
      number: 1,
      title: "Large",
      authorLogin: "author",
      state: "open",
      headRef: "feature",
      headSha: sha,
      baseRef: "main",
      reviewColumn: "waiting",
      lastActivityAt: new Date(),
    });
    await db.insert(schema.prFile).values(
      Array.from({ length: 101 }, (_, i) => ({
        repoId,
        prNumber: 1,
        headSha: sha,
        path: `src/file-${i}.ts`,
        blobSha: String(i),
        status: "modified",
        additions: 1,
        deletions: 1,
        patch,
        tier: "core" as const,
      })),
    );
    const api = appRouter.createCaller({ requestId: id, user } as never);
    const get = await api.review.get({ repo, number: 1, lightweight: true });
    assert.equal(get.patchesDeferred, true);
    assert.equal(get.files.length, 101);
    assert.ok(get.files.every((f) => f.patch === undefined));
    const input = {
      repo,
      number: 1,
      path: "src/file-0.ts",
      headSha: sha,
      fileSha: "0",
    };
    assert.equal((await api.review.filePatch(input)).patch, patch);
    await assert.rejects(
      api.review.filePatch({ ...input, fileSha: "wrong" }),
      /File not found/,
    );
    await assert.rejects(
      api.review.filePatch({ ...input, headSha: "old" }),
      /New commits arrived/,
    );
    await db
      .delete(schema.githubRepoAccess)
      .where(eq(schema.githubRepoAccess.userId, id));
    await assert.rejects(
      api.review.filePatch(input),
      /access|GitHub|Repository/i,
    );
  },
);
