import { publish } from "./live.js";
import { db, schema } from "@docks/db";
import { and, eq, isNull } from "drizzle-orm";
import { installationClient } from "./review/github.js";
import {
  inboxEvents,
  recipientLogins,
  type InboxPayload,
} from "./review/inbox-events.js";

export async function captureInboxEvents(
  repoId: number,
  event: string,
  payload: InboxPayload,
  deliveryId: string,
) {
  for (const value of inboxEvents(event, payload, deliveryId)) {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.reviewEvent)
        .values({ ...value, repoId, sourceKey: `${repoId}:${value.sourceKey}` })
        .onConflictDoNothing()
        .returning({ id: schema.reviewEvent.id });
      if (row)
        await tx
          .insert(schema.jobs)
          .values({ type: "inbox_event", payload: { eventId: row.id } });
    });
  }
}

export async function processInboxEvent(eventId: string) {
  const [event] = await db
    .select()
    .from(schema.reviewEvent)
    .where(
      and(
        eq(schema.reviewEvent.id, eventId),
        isNull(schema.reviewEvent.processedAt),
      ),
    );
  if (!event) return;
  const [repo] = await db
    .select({
      name: schema.repository.fullName,
      enabled: schema.repository.enabled,
      installationId: schema.repository.installationId,
      workspaceId: schema.githubInstallation.workspaceId,
    })
    .from(schema.repository)
    .innerJoin(
      schema.githubInstallation,
      eq(schema.repository.installationId, schema.githubInstallation.id),
    )
    .where(eq(schema.repository.id, event.repoId));
  if (!repo?.enabled) return;
  const gh = installationClient(repo.installationId);
  const pr = await gh.getPull(repo.name, event.prNumber);
  const reviews =
    event.kind === "new_commit"
      ? await gh.listReviews(repo.name, event.prNumber)
      : [];
  const comments =
    event.kind === "thread_reply"
      ? await gh.reviewComments(repo.name, event.prNumber)
      : [];
  const root = comments.find((c) => c.id === event.context.replyTo);
  const rootId = root?.in_reply_to_id ?? root?.id;
  const participants = rootId
    ? comments
        .filter((c) => c.id === rootId || c.in_reply_to_id === rootId)
        .map((c) => c.user?.login ?? "")
    : [];
  const logins =
    pr.state === "open" &&
    !(
      ["new_commit", "check_failed"].includes(event.kind) &&
      event.context.headSha &&
      event.context.headSha !== pr.head.sha
    ) &&
    !(
      event.kind === "review_requested" &&
      !pr.requested_reviewers.some(
        (r) =>
          r.login.toLowerCase() === event.context.requestedLogin?.toLowerCase(),
      )
    )
      ? recipientLogins(event.kind, event.context, {
          author: pr.user.login,
          requested: pr.requested_reviewers.map((r) => r.login),
          reviews: reviews
            .filter((r) => r.user && r.submitted_at)
            .map((r) => ({
              login: r.user!.login,
              commit: r.commit_id ?? null,
            })),
          participants,
        })
      : [];
  const members = logins.length
    ? await db
        .select({
          userId: schema.githubIdentity.userId,
          login: schema.githubIdentity.githubLogin,
          repoIds: schema.workspaceMember.repoIds,
        })
        .from(schema.githubIdentity)
        .innerJoin(
          schema.workspaceMember,
          and(
            eq(schema.workspaceMember.userId, schema.githubIdentity.userId),
            eq(schema.workspaceMember.workspaceId, repo.workspaceId),
          ),
        )
        .innerJoin(
          schema.githubRepoAccess,
          and(
            eq(schema.githubRepoAccess.userId, schema.githubIdentity.userId),
            eq(schema.githubRepoAccess.repoId, event.repoId),
          ),
        )
    : [];
  const recipients = members.filter(
    (m) =>
      logins.includes(m.login.toLowerCase()) &&
      (!m.repoIds || m.repoIds.includes(event.repoId)),
  );
  await db.transaction(async (tx) => {
    if (recipients.length)
      await tx
        .insert(schema.inboxItem)
        .values(recipients.map((m) => ({ eventId, userId: m.userId })))
        .onConflictDoNothing();
    await tx
      .update(schema.reviewEvent)
      .set({ processedAt: new Date() })
      .where(eq(schema.reviewEvent.id, eventId));
  });
  for (const m of recipients) await publish(repo.workspaceId, { t: "inbox" }, m.userId);
}
