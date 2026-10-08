import assert from "node:assert/strict";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { db, schema, closeDb } from "@docks/db";
import { and, eq } from "drizzle-orm";
import { appRouter } from "../routers/_app.js";
import { captureInboxEvents, processInboxEvent } from "../inbox.js";
import { emptySession } from "./session.js";

// Run against a disposable migrated database, never the development or production database.
test(
  "private recovery, atomic conflicts and durable inbox lifecycle",
  { skip: !process.env.DOCKS_TEST_DATABASE_URL },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
    const token = randomUUID();
    const people = ["Alice", "Bob", "Author"].map((name) => ({
      id: `${token}-${name}`,
      name,
      email: `${token}-${name}@example.test`,
      emailVerified: true,
      image: null,
    }));
    const workspaceId = token;
    const repoId = Date.now();
    const repo = `test/${token}`;
    const sha = "a".repeat(40);
    const originalFetch = globalThis.fetch;
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_APP_PRIVATE_KEY = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    globalThis.fetch = async (url) => {
      const path = String(url);
      if (path.includes("/access_tokens"))
        return Response.json({
          token: "test",
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        });
      if (path.endsWith("/pulls/1"))
        return Response.json({
          number: 1,
          state: "open",
          title: "Fixture PR",
          user: { login: "Author" },
          requested_reviewers: [{ login: "Alice" }],
          head: { sha },
        });
      throw new Error(`Unexpected GitHub call: ${path}`);
    };
    try {
      await db.insert(schema.user).values(people);
      await db
        .insert(schema.workspace)
        .values({ id: workspaceId, name: "Test", slug: token });
      await db
        .insert(schema.githubInstallation)
        .values({
          id: repoId,
          workspaceId,
          accountLogin: "test",
          accountType: "Organization",
        });
      await db
        .insert(schema.repository)
        .values({
          id: repoId,
          installationId: repoId,
          fullName: repo,
          defaultBranch: "main",
          aiEnabled: false,
        });
      await db
        .insert(schema.workspaceMember)
        .values(
          people.map((p) => ({
            workspaceId,
            userId: p.id,
            role: "member" as const,
          })),
        );
      await db
        .insert(schema.githubIdentity)
        .values(
          people.map((p, i) => ({
            userId: p.id,
            githubLogin: p.name,
            githubUserId: repoId + i,
            accessTokenEncrypted: "unused",
          })),
        );
      await db
        .insert(schema.githubRepoAccess)
        .values(people.map((p) => ({ userId: p.id, repoId })));
      await db
        .insert(schema.pullRequest)
        .values({
          repoId,
          number: 1,
          title: "Fixture PR",
          authorLogin: "Author",
          state: "open",
          headRef: "feature",
          headSha: sha,
          baseRef: "main",
          reviewColumn: "waiting",
          lastActivityAt: new Date(),
        });
      const alice = appRouter.createCaller({
        requestId: token,
        user: people[0]!,
      });
      const bob = appRouter.createCaller({
        requestId: token,
        user: people[1]!,
      });

      await t.test(
        "two devices cannot overwrite the same version; another user sees an empty session",
        async () => {
          const data = {
            ...emptySession(),
            textDrafts: { summary: "First draft" },
          };
          assert.equal(
            (
              await alice.review.saveSession({
                repo,
                number: 1,
                version: 0,
                data,
              })
            ).version,
            1,
          );
          const writes = await Promise.allSettled([
            alice.review.saveSession({
              repo,
              number: 1,
              version: 1,
              data: { ...data, textDrafts: { summary: "Device A" } },
            }),
            alice.review.saveSession({
              repo,
              number: 1,
              version: 1,
              data: { ...data, textDrafts: { summary: "Device B" } },
            }),
          ]);
          assert.equal(
            writes.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.equal(
            writes.filter(
              (r) => r.status === "rejected" && r.reason.code === "CONFLICT",
            ).length,
            1,
          );
          assert.equal(
            (
              await alice.review.session({
                repo,
                number: 1,
                clientUserId: people[0]!.id,
              })
            ).version,
            2,
          );
          assert.equal(
            (
              await bob.review.session({
                repo,
                number: 1,
                clientUserId: people[1]!.id,
              })
            ).version,
            0,
          );
          await assert.rejects(
            bob.review.session({
              repo,
              number: 1,
              clientUserId: people[0]!.id,
            }),
            (e: unknown) => (e as { code: string }).code === "UNAUTHORIZED",
          );
        },
      );

      await t.test(
        "redelivery and repeated processing produce one recipient item",
        async () => {
          const payload = {
            action: "review_requested",
            sender: { login: "Author" },
            pull_request: { number: 1, title: "Fixture PR", head: { sha } },
            requested_reviewer: { login: "Alice" },
          };
          await captureInboxEvents(repoId, "pull_request", payload, token);
          await captureInboxEvents(repoId, "pull_request", payload, token);
          const events = await db
            .select()
            .from(schema.reviewEvent)
            .where(eq(schema.reviewEvent.repoId, repoId));
          assert.equal(events.length, 1);
          const jobs = await db
            .select()
            .from(schema.jobs)
            .where(eq(schema.jobs.type, "inbox_event"));
          assert.equal(
            jobs.filter(
              (j) =>
                (j.payload as { eventId: string }).eventId === events[0]!.id,
            ).length,
            1,
          );
          await processInboxEvent(events[0]!.id);
          await processInboxEvent(events[0]!.id);
          assert.equal(await alice.inbox.unreadCount({ workspaceId }), 1);
          assert.equal(await bob.inbox.unreadCount({ workspaceId }), 0);
          const item = (await alice.inbox.list({ workspaceId })).items[0]!;
          await assert.rejects(bob.inbox.markRead({ id: item.id }));
          await alice.inbox.markRead({ id: item.id });
          assert.equal(await alice.inbox.unreadCount({ workspaceId }), 0);
          await alice.inbox.remind({
            id: item.id,
            at: new Date(Date.now() + 86400_000),
          });
          assert.equal(
            (await alice.inbox.list({ workspaceId })).items.length,
            0,
          );
          assert.equal(
            (await alice.inbox.list({ workspaceId, view: "snoozed" })).items
              .length,
            1,
          );
          await db
            .update(schema.inboxItem)
            .set({ remindAt: new Date(Date.now() - 1000) })
            .where(eq(schema.inboxItem.id, item.id));
          assert.equal(await alice.inbox.unreadCount({ workspaceId }), 1);
          await db
            .delete(schema.githubRepoAccess)
            .where(
              and(
                eq(schema.githubRepoAccess.userId, people[0]!.id),
                eq(schema.githubRepoAccess.repoId, repoId),
              ),
            );
          assert.equal(await alice.inbox.unreadCount({ workspaceId }), 0);
          await assert.rejects(alice.inbox.dismiss({ id: item.id }));
          await assert.rejects(
            alice.review.saveSession({
              repo,
              number: 1,
              version: 2,
              data: emptySession(),
            }),
          );
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
      const events = await db
        .select({ id: schema.reviewEvent.id })
        .from(schema.reviewEvent)
        .where(eq(schema.reviewEvent.repoId, repoId));
      for (const event of events)
        await db
          .delete(schema.jobs)
          .where(
            and(
              eq(schema.jobs.type, "inbox_event"),
              eq(schema.jobs.payload, { eventId: event.id }),
            ),
          );
      await db
        .delete(schema.pullRequest)
        .where(eq(schema.pullRequest.repoId, repoId));
      await db
        .delete(schema.workspace)
        .where(eq(schema.workspace.id, workspaceId));
      for (const person of people)
        await db.delete(schema.user).where(eq(schema.user.id, person.id));
      await closeDb();
    }
  },
);
