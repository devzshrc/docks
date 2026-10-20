import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { test } from "node:test";
import { closeDb, db, schema } from "@docks/db";
import { eq } from "drizzle-orm";
import { appRouter } from "../routers/_app.js";
import { answerQuestion, startQuestionStream } from "./ask-service.js";

/** A Responses API stream: two text deltas, then the completed response. */
function sseResponse(text: string[]) {
  const full = text.join("");
  const response = {
    id: "resp_stream",
    object: "response",
    status: "completed",
    model: "test",
    output: [{ id: "msg_1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: full, annotations: [] }] }],
    usage: { input_tokens: 5, output_tokens: 5 },
  };
  const events = [
    { type: "response.created", sequence_number: 0, response: { ...response, status: "in_progress", output: [] } },
    { type: "response.output_item.added", sequence_number: 1, output_index: 0, item: { ...response.output[0], status: "in_progress", content: [] } },
    { type: "response.content_part.added", sequence_number: 2, output_index: 0, item_id: "msg_1", content_index: 0, part: { type: "output_text", text: "", annotations: [] } },
    ...text.map((delta, i) => ({ type: "response.output_text.delta", sequence_number: 3 + i, output_index: 0, item_id: "msg_1", content_index: 0, delta })),
    { type: "response.completed", sequence_number: 10, response },
  ];
  return new Response(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });
}

test("streamed Ask answers: owner-only single claim, deltas, saved citations", { skip: !process.env.DOCKS_TEST_DATABASE_URL }, async (t) => {
  assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
  const id = randomUUID();
  const base = Date.now() % 1_000_000_000;
  const sha = "e".repeat(40);
  const users = ["a", "b"].map((n) => ({ id: `${id}-${n}`, name: n, email: `${id}-${n}@example.test`, emailVerified: true, image: null }));
  const realFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-only-not-real";
  process.env.GITHUB_APP_ID = "123";
  process.env.GITHUB_APP_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  const repoFiles: Record<string, string> = {
    "src/a.ts": 'import { helper } from "./helper.js";\nexport const a = helper();\nexport const b = 2;',
    "src/helper.ts": "export function helper() { return 1; }",
  };
  let aiPrompt = "";
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = url instanceof Request ? url.url : String(url);
    if (path.includes("api.openai.com/v1/responses")) {
      aiPrompt = url instanceof Request ? await url.clone().text() : String(init?.body);
      return sseResponse(["See src/a.ts:", "2 for it."]);
    }
    if (path.includes("/access_tokens")) return Response.json({ token: "t", expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    const contents = path.match(/\/contents\/([^?]+)\?ref=/);
    if (contents) {
      const file = repoFiles[decodeURIComponent(contents[1]!)];
      return file
        ? Response.json({ content: Buffer.from(file).toString("base64"), encoding: "base64" })
        : Response.json({ message: "Not Found" }, { status: 404 });
    }
    return realFetch(url, init);
  }) as typeof fetch;
  t.after(async () => {
    globalThis.fetch = realFetch;
    await db.delete(schema.workspace).where(eq(schema.workspace.id, id));
    for (const u of users) await db.delete(schema.user).where(eq(schema.user.id, u.id));
    await closeDb();
  });
  await db.insert(schema.user).values(users);
  await db.insert(schema.workspace).values({ id, name: "Ask", slug: id });
  await db.insert(schema.workspaceMember).values(users.map((u) => ({ workspaceId: id, userId: u.id, role: "member" as const })));
  await db.insert(schema.githubInstallation).values({ id: base, workspaceId: id, accountLogin: "o", accountType: "Organization" });
  await db.insert(schema.repository).values({ id: base, installationId: base, fullName: `o/${id}`, defaultBranch: "main" });
  await db.insert(schema.githubRepoAccess).values(users.map((u) => ({ userId: u.id, repoId: base })));
  await db.insert(schema.pullRequest).values({
    repoId: base, number: 1, title: "PR", authorLogin: "x", state: "open", headRef: "f", headSha: sha, baseRef: "main", reviewColumn: "waiting", lastActivityAt: new Date(),
  });
  await db.insert(schema.prFile).values({
    repoId: base, prNumber: 1, headSha: sha, path: "src/a.ts", blobSha: "c".repeat(40), status: "modified", additions: 1, deletions: 0, tier: "core", patch: "@@ -1,1 +1,2 @@\n a\n+b",
  });

  const alice = appRouter.createCaller({ requestId: id, user: users[0] } as never);
  const pending = await alice.review.ask({ repo: `o/${id}`, number: 1, question: "Where?", stream: true });
  assert.equal(pending.status, "pending");

  assert.equal(await startQuestionStream(pending.id, users[1]!.id), null, "someone else can't take it");
  assert.ok(await startQuestionStream(pending.id, users[0]!.id));
  assert.equal(await startQuestionStream(pending.id, users[0]!.id), null, "only one stream per question");

  const deltas: string[] = [];
  const saved = await answerQuestion(pending.id, (d) => deltas.push(d));
  assert.deepEqual(deltas, ["See src/a.ts:", "2 for it."]);
  assert.equal(saved.status, "completed");
  assert.equal(saved.answer, "See src/a.ts:2 for it.");
  assert.deepEqual(saved.citations, [{ path: "src/a.ts", line: 2, side: "RIGHT" }]);
  // The changed file and the file it imports go along whole.
  assert.match(aiPrompt, /Full files at the head commit/);
  assert.match(aiPrompt, /### src\/a.ts/);
  assert.match(aiPrompt, /### src\/helper.ts/);
});
