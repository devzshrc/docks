import { db, schema } from "@docks/db";
import { and, eq, isNull, isNotNull, lte, or, sql } from "drizzle-orm";
import { assertMember, canSeeRepo } from "../access.js";
import { RetryJobAtError } from "../jobs.js";
import { workspacePlan } from "../plans.js";
import {
  installationClient,
  type GhPull,
  type GhReview,
} from "../review/github.js";
import { sendReviewAlert } from "../slack.js";
import { addWorkingMinutes, workingMinutes, isWorkingTime } from "./clock.js";

export function humanReviews(pr: GhPull, reviews: GhReview[]) {
  return reviews.filter(
    (r) =>
      r.user &&
      r.submitted_at &&
      r.state !== "PENDING" &&
      r.user.type !== "Bot" &&
      !r.user.login.endsWith("[bot]") &&
      r.user.login.toLowerCase() !== pr.user.login.toLowerCase(),
  );
}
export async function reconcileDeadlines(
  repoId: number,
  pr: GhPull,
  reviews: GhReview[],
  now = new Date(),
) {
  const [policy] = await db
    .select({
      policy: schema.reviewPolicy,
      enabled: schema.repository.enabled,
      workspaceId: schema.githubInstallation.workspaceId,
    })
    .from(schema.reviewPolicy)
    .innerJoin(
      schema.repository,
      eq(schema.repository.id, schema.reviewPolicy.repoId),
    )
    .innerJoin(
      schema.githubInstallation,
      eq(schema.githubInstallation.id, schema.repository.installationId),
    )
    .where(eq(schema.reviewPolicy.repoId, repoId));
  if (!policy) return;
  const paid = (await workspacePlan(policy.workspaceId)) === "team";
  const human = humanReviews(pr, reviews);
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${repoId}:${pr.number}`}, 0))`,
    );
    // Serialize policy changes with cycle creation so disabling cannot leave a new active cycle behind.
    await tx.execute(
      sql`SELECT repo_id FROM review_policy WHERE repo_id = ${repoId} FOR SHARE`,
    );
    const [currentPolicy] = await tx
      .select()
      .from(schema.reviewPolicy)
      .where(eq(schema.reviewPolicy.repoId, repoId));
    if (!currentPolicy) return;
    policy.policy = currentPolicy;
    const active = await tx
      .select()
      .from(schema.reviewCycle)
      .where(
        and(
          eq(schema.reviewCycle.repoId, repoId),
          eq(schema.reviewCycle.prNumber, pr.number),
          isNull(schema.reviewCycle.completedAt),
          isNull(schema.reviewCycle.cancelledAt),
        ),
      );
    const stopped =
      !policy.policy.enabled || !policy.enabled || !paid || pr.state !== "open";
    for (const cycle of active) {
      if (
        stopped ||
        (cycle.kind === "changes" && cycle.headSha !== pr.head.sha)
      ) {
        await tx
          .update(schema.reviewCycle)
          .set({
            cancelledAt: now,
            cancelReason: stopped
              ? "Policy inactive or PR closed"
              : "Newer commit",
          })
          .where(eq(schema.reviewCycle.id, cycle.id));
        continue;
      }
      const reviewed = human.some(
        (r) =>
          cycle.kind === "first" ||
          ([
            cycle.reviewer.toLowerCase(),
            cycle.backupLogin?.toLowerCase(),
          ].includes(r.user!.login.toLowerCase()) &&
            r.commit_id === cycle.headSha),
      );
      if (reviewed) {
        await tx
          .update(schema.reviewCycle)
          .set({ completedAt: now })
          .where(eq(schema.reviewCycle.id, cycle.id));
        continue;
      }
      if (pr.draft && !cycle.pausedAt) {
        await tx
          .update(schema.reviewCycle)
          .set({
            pausedAt: now,
            remainingMinutes: workingMinutes(
              now,
              cycle.dueAt,
              cycle.rules.schedule,
            ),
          })
          .where(eq(schema.reviewCycle.id, cycle.id));
      } else if (!pr.draft && cycle.pausedAt) {
        const remaining = cycle.remainingMinutes ?? 0;
        await tx
          .update(schema.reviewCycle)
          .set({
            pausedAt: null,
            remainingMinutes: null,
            dueAt: addWorkingMinutes(now, remaining, cycle.rules.schedule),
            remindAt: addWorkingMinutes(
              now,
              Math.max(0, remaining - cycle.rules.reminderHours * 60),
              cycle.rules.schedule,
            ),
          })
          .where(eq(schema.reviewCycle.id, cycle.id));
      }
      if (cycle.kind === "first")
        await tx
          .update(schema.reviewCycle)
          .set({ headSha: pr.head.sha })
          .where(eq(schema.reviewCycle.id, cycle.id));
    }
    if (stopped || pr.draft) return;
    const latest = new Map<string, GhReview>();
    for (const r of [...human].sort((a, b) =>
      a.submitted_at!.localeCompare(b.submitted_at!),
    ))
      latest.set(r.user!.login.toLowerCase(), r);
    const needs = human.length
      ? [...latest]
          .filter(([, r]) => r.commit_id && r.commit_id !== pr.head.sha)
          .map(([reviewer]) => ({ kind: "changes" as const, reviewer }))
      : [{ kind: "first" as const, reviewer: "" }];
    const covered = await tx
      .select({ reviewer: schema.reviewCycle.reviewer })
      .from(schema.reviewCycle)
      .where(
        and(
          eq(schema.reviewCycle.repoId, repoId),
          eq(schema.reviewCycle.prNumber, pr.number),
          eq(schema.reviewCycle.headSha, pr.head.sha),
          isNotNull(schema.reviewCycle.completedAt),
          isNotNull(schema.reviewCycle.backupLogin),
        ),
      );
    for (const need of needs) {
      if (
        need.kind === "changes" &&
        covered.some((c) => c.reviewer === need.reviewer)
      )
        continue;
      if (
        active.some(
          (c) =>
            c.kind === need.kind &&
            !c.cancelledAt &&
            (need.kind === "first" || c.headSha === pr.head.sha) &&
            c.reviewer === need.reviewer,
        )
      )
        continue;
      // Each re-review head gets one cycle. A re-enabled first-review policy starts a fresh clock.
      const sourceKey =
        need.kind === "changes"
          ? `${repoId}:${pr.number}:${need.reviewer}:${pr.head.sha}:${policy.policy.updatedAt.toISOString()}`
          : `${repoId}:${pr.number}:first:${now.toISOString()}`;
      const rules = policy.policy.rules;
      await tx
        .insert(schema.reviewCycle)
        .values({
          ...need,
          repoId,
          prNumber: pr.number,
          headSha: pr.head.sha,
          sourceKey,
          rules,
          startedAt: now,
          dueAt: addWorkingMinutes(now, rules.hours * 60, rules.schedule),
          remindAt: addWorkingMinutes(
            now,
            (rules.hours - rules.reminderHours) * 60,
            rules.schedule,
          ),
        })
        .onConflictDoNothing();
    }
  });
}
/** One queue entry per cycle/stage, even when cron runs overlap. */
export async function scheduleReviewDeadlines(now = new Date()) {
  const cycles = await db
    .select()
    .from(schema.reviewCycle)
    .where(
      and(
        isNull(schema.reviewCycle.completedAt),
        isNull(schema.reviewCycle.cancelledAt),
        isNull(schema.reviewCycle.pausedAt),
        lte(schema.reviewCycle.remindAt, now),
        sql`EXTRACT(DOW FROM ${now}::timestamptz AT TIME ZONE (${schema.reviewCycle.rules}->'schedule'->>'timezone'))::integer IN (SELECT jsonb_array_elements_text(${schema.reviewCycle.rules}->'schedule'->'days')::integer)`,
        sql`EXTRACT(HOUR FROM ${now}::timestamptz AT TIME ZONE (${schema.reviewCycle.rules}->'schedule'->>'timezone')) >= (${schema.reviewCycle.rules}->'schedule'->>'startHour')::integer`,
        sql`EXTRACT(HOUR FROM ${now}::timestamptz AT TIME ZONE (${schema.reviewCycle.rules}->'schedule'->>'timezone')) < (${schema.reviewCycle.rules}->'schedule'->>'endHour')::integer`,
        sql`NOT EXISTS (SELECT 1 FROM review_delivery d WHERE d.cycle_id = ${schema.reviewCycle.id} AND d.stage = CASE WHEN ${schema.reviewCycle.dueAt} <= ${now} THEN 'overdue' ELSE 'reminder' END)`,
      ),
    )
    .orderBy(schema.reviewCycle.dueAt)
    .limit(200);
  for (const cycle of cycles) {
    if (!isWorkingTime(now, cycle.rules.schedule)) continue;
    const stage =
      cycle.dueAt <= now ? ("overdue" as const) : ("reminder" as const);
    if (stage === "reminder" && cycle.rules.reminderHours === 0) continue;
    await db.transaction(async (tx) => {
      const [delivery] = await tx
        .insert(schema.reviewDelivery)
        .values({ cycleId: cycle.id, stage })
        .onConflictDoNothing()
        .returning({ id: schema.reviewDelivery.id });
      if (delivery)
        await tx.insert(schema.jobs).values({
          type: "review_deadline",
          payload: { deliveryId: delivery.id },
        });
    });
  }
}
async function permitted(userId: string, workspaceId: string, repoId: number) {
  const member = await assertMember(userId, workspaceId).catch(() => null);
  return Boolean(member && (await canSeeRepo(userId, member.repoIds, repoId)));
}
export async function processReviewDeadline(deliveryId: string) {
  const now = new Date();
  const [delivery] = await db
    .update(schema.reviewDelivery)
    .set({ leaseUntil: new Date(now.getTime() + 120000) })
    .where(
      and(
        eq(schema.reviewDelivery.id, deliveryId),
        isNull(schema.reviewDelivery.skippedAt),
        isNull(schema.reviewDelivery.slackAt),
        or(
          isNull(schema.reviewDelivery.leaseUntil),
          lte(schema.reviewDelivery.leaseUntil, now),
        ),
      ),
    )
    .returning();
  if (!delivery) return;
  try {
    const [row] = await db
      .select({
        cycle: schema.reviewCycle,
        repo: schema.repository,
        workspaceId: schema.githubInstallation.workspaceId,
      })
      .from(schema.reviewCycle)
      .innerJoin(
        schema.repository,
        eq(schema.repository.id, schema.reviewCycle.repoId),
      )
      .innerJoin(
        schema.githubInstallation,
        eq(schema.githubInstallation.id, schema.repository.installationId),
      )
      .where(eq(schema.reviewCycle.id, delivery.cycleId));
    if (!row) return;
    const skip = async () => {
      await db
        .update(schema.reviewDelivery)
        .set({ skippedAt: new Date() })
        .where(eq(schema.reviewDelivery.id, deliveryId));
    };
    if ((await workspacePlan(row.workspaceId)) !== "team" || !row.repo.enabled)
      return skip();
    const [policy] = await db
      .select()
      .from(schema.reviewPolicy)
      .where(eq(schema.reviewPolicy.repoId, row.repo.id));
    if (!policy?.enabled) return skip();
    const gh = installationClient(row.repo.installationId);
    const [pr, reviews] = await Promise.all([
      gh.getPull(row.repo.fullName, row.cycle.prNumber),
      gh.listReviews(row.repo.fullName, row.cycle.prNumber),
    ]);
    await reconcileDeadlines(row.repo.id, pr, reviews);
    const [cycle] = await db
      .select()
      .from(schema.reviewCycle)
      .where(eq(schema.reviewCycle.id, row.cycle.id));
    if (
      !cycle ||
      cycle.completedAt ||
      cycle.cancelledAt ||
      cycle.pausedAt ||
      pr.draft ||
      pr.state !== "open" ||
      (delivery.stage === "overdue" ? cycle.dueAt : cycle.remindAt) > new Date()
    )
      return skip();
    if (delivery.stage === "reminder" && cycle.dueAt <= new Date())
      return skip();
    if (!isWorkingTime(new Date(), cycle.rules.schedule))
      throw new RetryJobAtError(
        new Date(
          addWorkingMinutes(new Date(), 1, cycle.rules.schedule).getTime() -
            60000,
        ),
      );
    const leadAllowed = await permitted(
      cycle.rules.leadUserId,
      row.workspaceId,
      row.repo.id,
    );
    const leadMember = leadAllowed
      ? await assertMember(cycle.rules.leadUserId, row.workspaceId).catch(
          () => null,
        )
      : null;
    const eligibleLead =
      leadMember && ["owner", "admin"].includes(leadMember.role);
    const requested =
      cycle.kind === "changes"
        ? [cycle.reviewer]
        : pr.requested_reviewers.map((r) => r.login.toLowerCase());
    const identities = (
      await db
        .select({ identity: schema.githubIdentity })
        .from(schema.githubIdentity)
        .innerJoin(
          schema.workspaceMember,
          eq(schema.workspaceMember.userId, schema.githubIdentity.userId),
        )
        .where(eq(schema.workspaceMember.workspaceId, row.workspaceId))
    ).map((r) => r.identity);
    const recipients: string[] = [];
    for (const identity of identities.filter((i) =>
      requested.includes(i.githubLogin.toLowerCase()),
    ))
      if (await permitted(identity.userId, row.workspaceId, row.repo.id))
        recipients.push(identity.userId);
    if (delivery.stage === "overdue" && eligibleLead)
      recipients.push(cycle.rules.leadUserId);
    const title = `${delivery.stage === "overdue" ? "Review overdue" : "Review deadline approaching"}: ${pr.title}`;
    const url = `${process.env.CLIENT_URL ?? "http://localhost:3000"}/review/${row.repo.fullName}/${pr.number}`;
    if (!delivery.inboxAt)
      await db.transaction(async (tx) => {
        const sourceKey = `deadline:${deliveryId}`;
        const [event] = await tx
          .insert(schema.reviewEvent)
          .values({
            repoId: row.repo.id,
            prNumber: pr.number,
            sourceKey,
            kind:
              delivery.stage === "overdue"
                ? "review_overdue"
                : "review_reminder",
            context: {
              title,
              actor: "",
              headSha: pr.head.sha,
              url,
              requestedLogin: cycle.reviewer || null,
              replyTo: null,
            },
            occurredAt: new Date(),
            processedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning({ id: schema.reviewEvent.id });
        const [existing] = event
          ? [event]
          : await tx
              .select({ id: schema.reviewEvent.id })
              .from(schema.reviewEvent)
              .where(eq(schema.reviewEvent.sourceKey, sourceKey));
        if (existing && recipients.length)
          await tx
            .insert(schema.inboxItem)
            .values(
              [...new Set(recipients)].map((userId) => ({
                eventId: existing.id,
                userId,
              })),
            )
            .onConflictDoNothing();
        await tx
          .update(schema.reviewDelivery)
          .set({ inboxAt: new Date() })
          .where(eq(schema.reviewDelivery.id, deliveryId));
      });
    // The configured workspace channel is the only Slack destination. No code or private draft text is sent.
    await sendReviewAlert(
      row.workspaceId,
      `${delivery.stage === "overdue" ? "Review overdue" : "Review due soon"}: <${url}|${row.repo.fullName} #${pr.number}>. Due ${cycle.dueAt.toISOString()}. ${delivery.stage === "overdue" ? "A lead can request a backup in Docks." : ""}`,
    );
    await db
      .update(schema.reviewDelivery)
      .set({ slackAt: new Date() })
      .where(eq(schema.reviewDelivery.id, deliveryId));
  } finally {
    await db
      .update(schema.reviewDelivery)
      .set({ leaseUntil: null })
      .where(eq(schema.reviewDelivery.id, deliveryId));
  }
}
