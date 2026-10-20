import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { closeDb, db, schema } from "@docks/db";
import { eq, inArray } from "drizzle-orm";
import { encrypt } from "./crypto.js";
import { appRouter } from "./routers/_app.js";

process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

test("teams, member profiles and review load", { skip: !process.env.DOCKS_TEST_DATABASE_URL }, async (t) => {
  assert.equal(process.env.DATABASE_URL, process.env.DOCKS_TEST_DATABASE_URL);
  const token = randomUUID();
  const other = randomUUID();
  const base = Date.now() % 1_000_000_000;
  const people = ["Alice", "Bob", "Carol"].map((name, i) => ({
    id: `${token}-${name}`,
    name,
    email: `${token}-${name}@example.test`,
    emailVerified: true,
    login: `${name.toLowerCase()}-${base}`,
    githubUserId: base * 10 + i,
  }));
  const [alice, bob, carol] = people;
  t.after(async () => {
    await db.delete(schema.workspace).where(inArray(schema.workspace.id, [token, other]));
    await db.delete(schema.user).where(inArray(schema.user.id, people.map((p) => p.id)));
    await closeDb();
  });

  await db.insert(schema.user).values(people.map(({ login: _l, githubUserId: _g, ...u }) => u));
  await db.insert(schema.githubIdentity).values(
    people.map((p) => ({ userId: p.id, githubLogin: p.login, githubUserId: p.githubUserId, accessTokenEncrypted: encrypt("x") })),
  );
  await db.insert(schema.workspace).values([
    { id: token, name: "People", slug: token },
    { id: other, name: "Other", slug: other },
  ]);
  await db.insert(schema.workspaceMember).values([
    { workspaceId: token, userId: alice!.id, role: "owner" },
    { workspaceId: token, userId: bob!.id, role: "member" },
    { workspaceId: other, userId: carol!.id, role: "owner" },
  ]);
  // Bob has two open PRs waiting on him; drafts don't count.
  await db.insert(schema.githubInstallation).values({ id: base, workspaceId: token, accountLogin: "o", accountType: "Organization" });
  await db.insert(schema.repository).values({ id: base, installationId: base, fullName: `o/${token}`, defaultBranch: "main" });
  await db.insert(schema.pullRequest).values(
    [false, false, true].map((draft, i) => ({
      repoId: base,
      number: i + 1,
      title: "PR",
      authorLogin: alice!.login,
      state: "open" as const,
      draft,
      headRef: "f",
      headSha: "a".repeat(40),
      baseRef: "main",
      reviewColumn: "waiting" as const,
      requestedReviewers: [bob!.login],
      lastActivityAt: new Date(Date.now() - (i + 1) * 3_600_000),
    })),
  );

  const as = (u: (typeof people)[number]) => appRouter.createCaller({ requestId: token, user: { ...u, image: null } } as never);
  const owner = as(alice!);
  const member = as(bob!);

  await t.test("only owners and admins manage teams", async () => {
    await assert.rejects(member.people.createTeam({ workspaceId: token, name: "Nope" }), /role doesn't allow/);
    await assert.rejects(as(carol!).people.teams({ workspaceId: token }));
  });

  let teamId = "";
  await t.test("create, rename and staff a team; outsiders are dropped", async () => {
    ({ id: teamId } = await owner.people.createTeam({ workspaceId: token, name: "Platform" }));
    await owner.people.renameTeam({ teamId, name: "Platform team" });
    await owner.people.setTeamMembers({ teamId, userIds: [bob!.id, carol!.id] });
    const [team] = await owner.people.teams({ workspaceId: token });
    assert.equal(team!.name, "Platform team");
    assert.deepEqual(team!.userIds, [bob!.id]);
    await assert.rejects(member.people.setTeamMembers({ teamId, userIds: [] }));
  });

  await t.test("the people list shows teams and open review load", async () => {
    await owner.people.updateMember({ workspaceId: token, userId: bob!.id, maxOpenReviews: 2 });
    const list = await member.people.list({ workspaceId: token });
    const b = list.find((p) => p.userId === bob!.id)!;
    assert.deepEqual(b.teams.map((x) => x.name), ["Platform team"]);
    assert.equal(b.openReviews, 2);
    assert.equal(b.overLimit, true);
    assert.equal(list.find((p) => p.userId === alice!.id)!.openReviews, 0);
  });

  await t.test("people edit their own profile but not anyone else's", async () => {
    await member.people.updateMember({ workspaceId: token, userId: bob!.id, expertise: ["Billing", "billing"], awayUntil: "2099-01-01" });
    const me = (await member.people.list({ workspaceId: token })).find((p) => p.userId === bob!.id)!;
    assert.deepEqual(me.expertise, ["billing"]);
    assert.equal(me.away, true);
    await assert.rejects(member.people.updateMember({ workspaceId: token, userId: alice!.id, maxOpenReviews: 1 }));
  });

  await t.test("deleting a team removes its memberships", async () => {
    await owner.people.deleteTeam({ teamId });
    assert.deepEqual(await owner.people.teams({ workspaceId: token }), []);
    assert.equal((await db.select().from(schema.teamMember).where(eq(schema.teamMember.teamId, teamId))).length, 0);
  });
});
