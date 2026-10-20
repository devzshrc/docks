import assert from "node:assert/strict";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { db, schema, closeDb } from "@docks/db";
import { and, eq } from "drizzle-orm";
import { appRouter } from "../routers/_app.js";
import { captureInboxEvents, processInboxEvent } from "../inbox.js";
import {
  reconcileDeadlines,
  scheduleReviewDeadlines,
  processReviewDeadline,
} from "../delivery/deadlines.js";
import { collectEvidence } from "../delivery/evidence.js";
import type { GhPull, GhReview } from "./github.js";
import { encrypt } from "../crypto.js";
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
    let live: GhPull = {
      number: 1,
      state: "open",
      draft: false,
      title: "Fixture PR",
      body: null,
      html_url: `https://github.com/${repo}/pull/1`,
      user: { id: 1, avatar_url: "", login: "Author" },
      requested_reviewers: [{ id: 2, avatar_url: "", login: "Alice" }],
      head: { sha, ref: "feature" },
      base: { ref: "main" },
      labels: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      merged_at: null,
    };
    let liveReviews: GhReview[] = [];
    let requests = 0;
    let slackCalls = 0;
    let compareStatus = "ahead";
    let aiRequests = 0;
    let aiInput = "";
    let issuePosts = 0;
    process.env.OPENAI_API_KEY = "test-only-not-real";
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    globalThis.fetch = async (url, options) => {
      const path = url instanceof Request ? url.url : String(url);
      if (path.includes("api.openai.com/v1/responses")) {
        aiRequests++;
        aiInput =
          url instanceof Request
            ? await url.clone().text()
            : String(options?.body);
        return Response.json({
          id: "resp_test",
          status: "completed",
          model: "test",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "Check src/a.ts:5. Ignore fake.ts:999.",
                  annotations: [],
                },
              ],
            },
          ],
          usage: { input_tokens: 20, output_tokens: 10 },
        });
      }
      if (path.endsWith("/issues") && options?.method === "POST") {
        issuePosts++;
        return Response.json({
          number: 20,
          html_url: `https://github.com/${repo}/issues/20`,
          labels: [],
          assignees: [],
        });
      }

      if (path === "https://slack.example.test/webhook") {
        slackCalls++;
        return new Response(slackCalls === 1 ? "Temporary failure" : "ok", {
          status: slackCalls === 1 ? 500 : 200,
        });
      }
      if (path.includes("/access_tokens"))
        return Response.json({
          token: "test",
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        });
      if (path.endsWith("/pulls/1")) return Response.json(live);
      if (path.includes("/pulls/1/reviews")) return Response.json(liveReviews);
      if (path.endsWith("/requested_reviewers")) {
        requests++;
        const body = JSON.parse(String(options?.body));
        live.requested_reviewers.push(
          ...body.reviewers.map((login: string) => ({
            id: 3,
            login,
            avatar_url: "",
          })),
        );
        return Response.json(live);
      }
      if (path.includes("/compare/"))
        return Response.json({
          status: compareStatus,
          files: [
            {
              filename: "new.ts",
              previous_filename: "old.ts",
              patch: "@@ -1 +1 @@\n-old\n+new",
              status: "renamed",
            },
          ],
        });
      if (path.includes("/contents/"))
        return Response.json({ message: "Not found" }, { status: 404 });
      throw new Error(`Unexpected GitHub call: ${path}`);
    };
    try {
      await db.insert(schema.user).values(people);
      await db
        .insert(schema.workspace)
        .values({ id: workspaceId, name: "Test", slug: token });
      await db.insert(schema.githubInstallation).values({
        id: repoId,
        workspaceId,
        accountLogin: "test",
        accountType: "Organization",
      });
      await db.insert(schema.repository).values({
        id: repoId,
        installationId: repoId,
        fullName: repo,
        defaultBranch: "main",
        aiEnabled: false,
      });
      await db.insert(schema.workspaceMember).values(
        people.map((p) => ({
          workspaceId,
          userId: p.id,
          role: "member" as const,
        })),
      );
      await db.insert(schema.githubIdentity).values(
        people.map((p, i) => ({
          userId: p.id,
          githubLogin: p.name,
          githubUserId: repoId + i,
          accessTokenEncrypted: encrypt("test-user-token"),
        })),
      );
      await db
        .insert(schema.githubRepoAccess)
        .values(people.map((p) => ({ userId: p.id, repoId })));
      await db.insert(schema.pullRequest).values({
        repoId,
        number: 1,
        title: "Fixture PR",
        authorLogin: "Author",
        state: "open",
        headRef: "feature",
        headSha: sha,
        baseRef: "main",
        reviewColumn: "waiting",
        requestedReviewers: ["Alice"],
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
        "knowledge revisions enforce permission, scope and concurrent edits",
        async () => {
          await assert.rejects(
            () =>
              alice.knowledge.save({
                repo,
                title: "Conventions",
                category: "testing",
                body: "Test changes",
              }),
            /role/,
          );
          await db
            .update(schema.workspaceMember)
            .set({ role: "admin" })
            .where(
              and(
                eq(schema.workspaceMember.workspaceId, workspaceId),
                eq(schema.workspaceMember.userId, people[0]!.id),
              ),
            );
          const doc = await alice.knowledge.save({
            repo,
            title: "Conventions",
            category: "testing",
            body: "Test changes",
          });
          const writes = await Promise.allSettled([
            alice.knowledge.save({
              repo,
              id: doc.id,
              expectedVersion: 1,
              title: "One",
              category: "testing",
              body: "One",
            }),
            alice.knowledge.save({
              repo,
              id: doc.id,
              expectedVersion: 1,
              title: "Two",
              category: "testing",
              body: "Two",
            }),
          ]);
          assert.equal(
            writes.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.equal(
            (await bob.knowledge.revisions({ repo, id: doc.id })).length,
            2,
          );
          const active = (await alice.knowledge.list({ repo })).documents[0]!;
          await alice.knowledge.save({
            repo,
            id: doc.id,
            expectedVersion: active.version,
            title: active.title,
            category: "testing",
            body: active.body,
            archived: true,
          });
          assert.equal(
            (await bob.knowledge.list({ repo })).documents.length,
            0,
          );
          assert.equal(
            (await bob.knowledge.list({ repo, archived: true })).documents
              .length,
            1,
          );
          await db
            .update(schema.workspaceMember)
            .set({ role: "member" })
            .where(
              and(
                eq(schema.workspaceMember.workspaceId, workspaceId),
                eq(schema.workspaceMember.userId, people[0]!.id),
              ),
            );
        },
      );
      await t.test(
        "personal inbox derives from PR state and claims cannot overwrite another owner",
        async () => {
          assert.equal(
            (await alice.reviewInbox.list({ workspaceId })).items.length,
            1,
          );
          await alice.reviewInbox.snooze({
            repo,
            number: 1,
            until: new Date(Date.now() + 3600000),
          });
          assert.equal(
            (await alice.reviewInbox.list({ workspaceId })).items.length,
            0,
          );
          assert.equal(
            (await alice.reviewInbox.list({ workspaceId, view: "snoozed" }))
              .items.length,
            1,
          );
          assert.equal(
            (await bob.reviewInbox.list({ workspaceId, view: "snoozed" })).items
              .length,
            0,
          );
          await alice.reviewInbox.snooze({ repo, number: 1, until: null });
          const claims = await Promise.allSettled([
            alice.review.claim({ repo, number: 1, claim: true }),
            bob.review.claim({ repo, number: 1, claim: true }),
          ]);
          assert.equal(
            claims.filter((r) => r.status === "fulfilled").length,
            1,
          );
          const [pull] = await db
            .select()
            .from(schema.pullRequest)
            .where(
              and(
                eq(schema.pullRequest.repoId, repoId),
                eq(schema.pullRequest.number, 1),
              ),
            );
          const owner = pull!.claimedBy === people[0]!.id ? alice : bob;
          await owner.review.claim({ repo, number: 1, claim: false });
          await db
            .update(schema.pullRequest)
            .set({ state: "merged" })
            .where(eq(schema.pullRequest.repoId, repoId));
          assert.equal(
            (await alice.reviewInbox.list({ workspaceId })).items.length,
            0,
          );
          await db
            .update(schema.pullRequest)
            .set({ state: "open" })
            .where(eq(schema.pullRequest.repoId, repoId));
        },
      );
      await t.test(
        "saved AI questions remain private and carry their original commit",
        async () => {
          await db
            .insert(schema.reviewQuestion)
            .values({
              repoId,
              prNumber: 1,
              userId: people[0]!.id,
              headSha: sha,
              question: "Why?",
              answer: "Because",
              citations: [],
              knowledge: [],
            });
          assert.equal(
            (await alice.review.questions({ repo, number: 1 })).questions
              .length,
            1,
          );
          assert.equal(
            (await bob.review.questions({ repo, number: 1 })).questions.length,
            0,
          );
          await db
            .delete(schema.githubRepoAccess)
            .where(
              and(
                eq(schema.githubRepoAccess.userId, people[1]!.id),
                eq(schema.githubRepoAccess.repoId, repoId),
              ),
            );
          await assert.rejects(() => bob.review.questions({ repo, number: 1 }));
          await assert.rejects(() => bob.knowledge.list({ repo }));
          await db
            .insert(schema.githubRepoAccess)
            .values({ userId: people[1]!.id, repoId });
        },
      );

      await t.test(
        "AI uses selected knowledge, saves validated citations and enforces quota before provider calls",
        async () => {
          await db
            .update(schema.repository)
            .set({ aiEnabled: true })
            .where(eq(schema.repository.id, repoId));
          await db
            .insert(schema.prFile)
            .values({
              repoId,
              prNumber: 1,
              headSha: sha,
              path: "src/a.ts",
              blobSha: sha,
              status: "modified",
              additions: 1,
              deletions: 1,
              tier: "core",
              patch: "@@ -5 +5 @@\n-old\n+new",
            });
          const [doc] = await db
            .insert(schema.repositoryKnowledge)
            .values({
              repoId,
              title: "Testing",
              category: "testing",
              body: "Use permission tests",
            })
            .returning();
          const answer = await alice.review.ask({
            repo,
            number: 1,
            question: "Is this tested?",
            path: "src/a.ts",
            line: 5,
            knowledgeIds: [doc!.id],
          });
          assert.equal(answer.status, "completed");
          assert.equal(answer.knowledge[0]!.version, 1);
          assert.deepEqual(answer.citations, [
            { path: "src/a.ts", line: 5, side: "RIGHT" },
          ]);
          assert.ok(aiInput.includes("Use permission tests"));
          await assert.rejects(() =>
            alice.review.ask({
              repo,
              number: 1,
              question: "Unknown",
              path: "src/a.ts",
              line: 999,
            }),
          );
          await db
            .insert(schema.reviewQuestion)
            .values(
              Array.from({ length: 30 }, () => ({
                repoId,
                prNumber: 1,
                userId: people[0]!.id,
                headSha: sha,
                question: "Quota fixture",
                answer: "Answer",
                citations: [],
                knowledge: [],
              })),
            );
          await assert.rejects(
            () => alice.review.ask({ repo, number: 1, question: "Over limit" }),
            /30 answers/,
          );
          assert.equal(aiRequests, 1);
          // Failed attempts give their quota back.
          await db
            .update(schema.reviewQuestion)
            .set({ status: "failed" })
            .where(eq(schema.reviewQuestion.question, "Quota fixture"));
          await alice.review.ask({ repo, number: 1, question: "After failures" });
          assert.equal(aiRequests, 2);
          await db
            .delete(schema.reviewQuestion)
            .where(eq(schema.reviewQuestion.userId, people[0]!.id));
          await db
            .delete(schema.prFile)
            .where(eq(schema.prFile.repoId, repoId));
          await db
            .update(schema.repository)
            .set({ aiEnabled: false })
            .where(eq(schema.repository.id, repoId));
        },
      );
      await t.test(
        "follow-up issue creation links provenance and replays without a second GitHub POST",
        async () => {
          const input = {
            repo,
            title: "Follow-up",
            body: "Investigate",
            type: "task" as const,
            clientKey: randomUUID(),
            followUp: {
              repo,
              number: 1,
              headSha: sha,
              path: "src/a.ts",
              line: 5,
            },
          };
          const first = await alice.issue.create(input);
          const second = await alice.issue.create(input);
          assert.equal(first.number, 20);
          assert.equal(second.replayed, true);
          assert.equal(issuePosts, 1);
          const links = await alice.review.followUps({ repo, number: 1 });
          assert.equal(links.length, 1);
          assert.equal(links[0]!.link.headSha, sha);
          await db
            .delete(schema.jobs)
            .where(
              and(
                eq(schema.jobs.type, "sync_issue"),
                eq(schema.jobs.payload, { repoId, number: 20 }),
              ),
            );
        },
      );

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
        "paid policies, paused clocks, idempotent escalation, releases and evidence",
        async () => {
          await db
            .update(schema.workspaceMember)
            .set({ role: "owner" })
            .where(
              and(
                eq(schema.workspaceMember.workspaceId, workspaceId),
                eq(schema.workspaceMember.userId, people[0]!.id),
              ),
            );
          const rules = {
            hours: 8,
            reminderHours: 2,
            schedule: {
              timezone: "UTC",
              days: [0, 1, 2, 3, 4, 5, 6],
              startHour: 0,
              endHour: 24,
            },
            leadUserId: people[0]!.id,
          };
          await assert.rejects(
            alice.delivery.savePolicy({ repo, enabled: true, rules }),
            (e: unknown) => (e as { code: string }).code === "FORBIDDEN",
          );
          await db
            .update(schema.workspace)
            .set({ plan: "team" })
            .where(eq(schema.workspace.id, workspaceId));
          await assert.rejects(
            bob.delivery.savePolicy({ repo, enabled: true, rules }),
          );
          await alice.delivery.savePolicy({ repo, enabled: true, rules });
          const start = new Date(Date.now() - 12 * 3600000);
          await Promise.all([
            reconcileDeadlines(repoId, live, [], start),
            reconcileDeadlines(repoId, live, [], start),
          ]);
          const cycles = await alice.delivery.prCycles({ repo, number: 1 });
          assert.equal(cycles.length, 1);
          const first = cycles[0]!;
          await reconcileDeadlines(
            repoId,
            { ...live, draft: true },
            [],
            new Date(start.getTime() + 3600000),
          );
          const paused = (
            await alice.delivery.prCycles({ repo, number: 1 })
          )[0]!;
          assert.equal(paused.remainingMinutes, 420);
          await reconcileDeadlines(
            repoId,
            live,
            [],
            new Date(start.getTime() + 3 * 3600000),
          );
          const resumed = (
            await alice.delivery.prCycles({ repo, number: 1 })
          )[0]!;
          assert.equal(
            resumed.dueAt.getTime() - first.dueAt.getTime(),
            2 * 3600000,
          );
          await Promise.all([
            scheduleReviewDeadlines(),
            scheduleReviewDeadlines(),
          ]);
          const deliveries = await db
            .select()
            .from(schema.reviewDelivery)
            .where(eq(schema.reviewDelivery.cycleId, first.id));
          assert.equal(deliveries.length, 1);
          assert.equal(deliveries[0]!.stage, "overdue");
          await db
            .insert(schema.slackIntegration)
            .values({
              workspaceId,
              teamId: "test",
              teamName: "Test",
              channelId: "test",
              channelName: "reviews",
              webhookUrlEncrypted: encrypt(
                "https://slack.example.test/webhook",
              ),
            });
          await assert.rejects(processReviewDeadline(deliveries[0]!.id));
          assert.equal(await alice.inbox.unreadCount({ workspaceId }), 1);
          await processReviewDeadline(deliveries[0]!.id);
          await processReviewDeadline(deliveries[0]!.id);
          assert.equal(slackCalls, 2);
          assert.equal(await alice.inbox.unreadCount({ workspaceId }), 1);
          await db
            .update(schema.inboxItem)
            .set({ dismissedAt: new Date() })
            .where(eq(schema.inboxItem.userId, people[0]!.id));
          liveReviews = [
            {
              id: repoId,
              user: { id: 2, avatar_url: "", login: "Alice" },
              state: "APPROVED",
              submitted_at: new Date().toISOString(),
              commit_id: sha,
            },
          ];
          await reconcileDeadlines(repoId, live, liveReviews);
          assert.equal(
            (await alice.delivery.prCycles({ repo, number: 1 })).length,
            0,
          );
          live = { ...live, head: { ...live.head, sha: "b".repeat(40) } };
          await reconcileDeadlines(repoId, live, liveReviews);
          const changes = await alice.delivery.prCycles({ repo, number: 1 });
          assert.equal(changes.length, 1);
          assert.equal(changes[0]!.kind, "changes");
          await db
            .update(schema.pullRequest)
            .set({ headSha: live.head.sha })
            .where(
              and(
                eq(schema.pullRequest.repoId, repoId),
                eq(schema.pullRequest.number, 1),
              ),
            );
          await db
            .insert(schema.prReview)
            .values({
              id: repoId,
              repoId,
              prNumber: 1,
              reviewerLogin: "Alice",
              state: "APPROVED",
              submittedAt: new Date(),
              commitSha: sha,
              userType: "User",
            });
          const comparison = await alice.review.sinceLastReview({
            repo,
            number: 1,
          });
          assert.equal(comparison.complete, true);
          assert.ok(comparison.files?.includes("old.ts"));
          assert.ok(comparison.changes?.[0]?.patch?.includes("+new"));
          compareStatus = "diverged";
          assert.equal(
            (await alice.review.sinceLastReview({ repo, number: 1 })).complete,
            false,
          );
          compareStatus = "ahead";
          await db
            .update(schema.reviewCycle)
            .set({ dueAt: new Date(Date.now() - 3600000) })
            .where(eq(schema.reviewCycle.id, changes[0]!.id));
          await db
            .update(schema.workspaceMember)
            .set({ maxOpenReviews: 0 })
            .where(
              and(
                eq(schema.workspaceMember.workspaceId, workspaceId),
                eq(schema.workspaceMember.userId, people[1]!.id),
              ),
            );
          assert.equal(
            (await alice.delivery.backups({ repo, number: 1 })).length,
            0,
          );
          await assert.rejects(
            alice.delivery.requestBackup({
              cycleId: changes[0]!.id,
              login: "Bob",
            }),
          );
          assert.equal(requests, 0);
          await db
            .update(schema.workspaceMember)
            .set({ maxOpenReviews: null })
            .where(
              and(
                eq(schema.workspaceMember.workspaceId, workspaceId),
                eq(schema.workspaceMember.userId, people[1]!.id),
              ),
            );
          const backupWrites = await Promise.allSettled([
            alice.delivery.requestBackup({
              cycleId: changes[0]!.id,
              login: "Bob",
            }),
            alice.delivery.requestBackup({
              cycleId: changes[0]!.id,
              login: "Bob",
            }),
          ]);
          assert.equal(
            backupWrites.filter((w) => w.status === "fulfilled").length,
            1,
          );
          assert.equal(requests, 1);
          await collectEvidence(repoId, live, liveReviews, []);
          await collectEvidence(repoId, live, liveReviews, []);
          const collected = await db
            .select()
            .from(schema.reviewEvidence)
            .where(eq(schema.reviewEvidence.repoId, repoId));
          assert.equal(collected.length, 1);
          const backupReview: GhReview = {
            id: repoId + 1,
            user: { id: 3, login: "Bob", avatar_url: "" },
            state: "APPROVED",
            submitted_at: new Date().toISOString(),
            commit_id: live.head.sha,
          };
          await reconcileDeadlines(repoId, live, [
            ...liveReviews,
            backupReview,
          ]);
          assert.equal(
            (await alice.delivery.prCycles({ repo, number: 1 })).length,
            0,
          );
          await reconcileDeadlines(repoId, live, [
            ...liveReviews,
            backupReview,
          ]);
          assert.equal(
            (await alice.delivery.prCycles({ repo, number: 1 })).length,
            0,
          );
          const release = await alice.releases.create({
            workspaceId,
            name: "Pilot",
            targetDate: null,
          });
          await alice.releases.setPr({
            id: release.id,
            repo,
            number: 1,
            included: true,
          });
          await Promise.all([
            alice.releases.refresh({ id: release.id }),
            alice.releases.refresh({ id: release.id }),
          ]);
          await alice.releases.setPr({
            id: release.id,
            repo,
            number: 1,
            included: true,
          });
          const refreshJobs = await db
            .select()
            .from(schema.jobs)
            .where(eq(schema.jobs.type, "release_readiness"));
          assert.equal(
            refreshJobs.filter(
              (job) =>
                (job.payload as { releaseId: string }).releaseId === release.id,
            ).length,
            1,
          );
          assert.equal(
            (await alice.releases.get({ id: release.id })).items.length,
            1,
          );
          await assert.rejects(
            bob.releases.setPr({
              id: release.id,
              repo,
              number: 1,
              included: false,
            }),
          );
          const exported = await alice.releases.evidence({
            workspaceId,
            prs: [{ repo, number: 1 }],
            format: "json",
          });
          assert.equal(
            JSON.parse(exported.content).evidence[0].snapshots.length,
            1,
          );
          await assert.rejects(
            bob.releases.evidence({
              workspaceId,
              prs: [{ repo, number: 1 }],
              format: "json",
            }),
          );
          await db
            .delete(schema.githubRepoAccess)
            .where(
              and(
                eq(schema.githubRepoAccess.userId, people[1]!.id),
                eq(schema.githubRepoAccess.repoId, repoId),
              ),
            );
          const hidden = await bob.releases.get({ id: release.id });
          assert.equal(hidden.items.length, 0);
          assert.equal(hidden.incomplete, true);
          await db
            .insert(schema.githubRepoAccess)
            .values({ userId: people[1]!.id, repoId });
          await db
            .update(schema.workspace)
            .set({ plan: "free" })
            .where(eq(schema.workspace.id, workspaceId));
          assert.equal(
            (await alice.releases.get({ id: release.id })).items.length,
            1,
          );
          await assert.rejects(alice.releases.refresh({ id: release.id }));
          await assert.rejects(
            alice.releases.evidence({
              workspaceId,
              prs: [{ repo, number: 1 }],
              format: "csv",
            }),
          );
          await alice.delivery.savePolicy({ repo, enabled: false, rules });
          assert.equal(
            (await alice.delivery.prCycles({ repo, number: 1 })).length,
            0,
          );
          live = {
            ...live,
            head: { ...live.head, sha },
            requested_reviewers: [{ id: 2, login: "Alice", avatar_url: "" }],
          };
          liveReviews = [];
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
            .where(
              and(
                eq(schema.reviewEvent.repoId, repoId),
                eq(schema.reviewEvent.kind, "review_requested"),
              ),
            );
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
      const fixtureJobs = await db.select().from(schema.jobs);
      for (const job of fixtureJobs)
        if (
          (job.payload as { repoId?: number }).repoId === repoId ||
          (job.payload as { deliveryId?: string }).deliveryId
        ) {
          if ((job.payload as { repoId?: number }).repoId === repoId)
            await db.delete(schema.jobs).where(eq(schema.jobs.id, job.id));
          else {
            const [delivery] = await db
              .select()
              .from(schema.reviewDelivery)
              .innerJoin(
                schema.reviewCycle,
                eq(schema.reviewCycle.id, schema.reviewDelivery.cycleId),
              )
              .where(
                and(
                  eq(
                    schema.reviewDelivery.id,
                    (job.payload as { deliveryId: string }).deliveryId,
                  ),
                  eq(schema.reviewCycle.repoId, repoId),
                ),
              );
            if (delivery)
              await db.delete(schema.jobs).where(eq(schema.jobs.id, job.id));
          }
        }
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
        .delete(schema.prReview)
        .where(eq(schema.prReview.repoId, repoId));
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
