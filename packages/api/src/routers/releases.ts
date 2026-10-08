import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, or, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  assertCan,
  assertMember,
  audit,
  repoForUser,
  visibleRepos,
} from "../access.js";
import { assertTeam } from "../plans.js";
import { currentReadiness } from "../delivery/releases.js";
import { csvCell } from "../delivery/evidence.js";
import { protectedProcedure, router } from "../trpc.js";
const ws = z.object({ workspaceId: z.string() });
const idInput = z.object({ id: z.string().uuid() });
async function releaseFor(userId: string, id: string, edit = false) {
  const [row] = await db
    .select()
    .from(schema.release)
    .where(eq(schema.release.id, id));
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  if (edit) {
    await assertCan(userId, row.workspaceId, "workspace.manage");
    await assertTeam(row.workspaceId);
  } else await assertMember(userId, row.workspaceId);
  return row;
}
async function visible(userId: string, workspaceId: string) {
  const member = await assertMember(userId, workspaceId);
  return visibleRepos(userId, workspaceId, member.repoIds);
}
export const releasesRouter = router({
  list: protectedProcedure.input(ws).query(async ({ ctx, input }) => {
    await assertMember(ctx.user.id, input.workspaceId);
    return db
      .select()
      .from(schema.release)
      .where(eq(schema.release.workspaceId, input.workspaceId))
      .orderBy(desc(schema.release.createdAt))
      .limit(100);
  }),
  create: protectedProcedure
    .input(
      ws.extend({
        name: z.string().trim().min(1).max(100),
        targetDate: z.date().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "workspace.manage");
      await assertTeam(input.workspaceId);
      const [row] = await db.insert(schema.release).values(input).returning();
      await audit(input.workspaceId, ctx.user.id, "release.create", row!.id, {
        name: input.name,
      });
      return row!;
    }),
  update: protectedProcedure
    .input(
      idInput.extend({
        name: z.string().trim().min(1).max(100),
        targetDate: z.date().nullable(),
        status: z.enum(["active", "completed"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await releaseFor(ctx.user.id, input.id, true);
      await db
        .update(schema.release)
        .set({
          name: input.name,
          targetDate: input.targetDate,
          status: input.status,
        })
        .where(eq(schema.release.id, input.id));
      await audit(row.workspaceId, ctx.user.id, "release.update", row.id);
    }),
  candidates: protectedProcedure.input(ws).query(async ({ ctx, input }) => {
    const repos = await visible(ctx.user.id, input.workspaceId);
    if (!repos.length) return [];
    return db
      .select({
        repo: schema.repository.fullName,
        repoId: schema.repository.id,
        number: schema.pullRequest.number,
        title: schema.pullRequest.title,
      })
      .from(schema.pullRequest)
      .innerJoin(
        schema.repository,
        eq(schema.repository.id, schema.pullRequest.repoId),
      )
      .where(
        and(
          inArray(
            schema.pullRequest.repoId,
            repos.map((r) => r.id),
          ),
          eq(schema.pullRequest.state, "open"),
        ),
      )
      .orderBy(desc(schema.pullRequest.lastActivityAt))
      .limit(200);
  }),
  setPr: protectedProcedure
    .input(
      idInput.extend({
        repo: z.string(),
        number: z.number().int().positive(),
        included: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const release = await releaseFor(ctx.user.id, input.id, true);
      const repo = await repoForUser(ctx.user.id, input.repo);
      if (repo.workspaceId !== release.workspaceId)
        throw new TRPCError({ code: "NOT_FOUND" });
      const key = and(
        eq(schema.releasePr.releaseId, release.id),
        eq(schema.releasePr.repoId, repo.id),
        eq(schema.releasePr.prNumber, input.number),
      );
      if (input.included)
        await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT id FROM release WHERE id = ${release.id} FOR UPDATE`,
          );
          const existing = await tx
            .select()
            .from(schema.releasePr)
            .where(eq(schema.releasePr.releaseId, release.id));
          if (
            existing.length >= 100 &&
            !existing.some(
              (p) => p.repoId === repo.id && p.prNumber === input.number,
            )
          )
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "A release supports up to 100 pull requests.",
            });
          const [pr] = await tx
            .select()
            .from(schema.pullRequest)
            .where(
              and(
                eq(schema.pullRequest.repoId, repo.id),
                eq(schema.pullRequest.number, input.number),
              ),
            );
          if (!pr) throw new TRPCError({ code: "NOT_FOUND" });
          await tx
            .insert(schema.releasePr)
            .values({
              releaseId: release.id,
              repoId: repo.id,
              prNumber: input.number,
            })
            .onConflictDoNothing();
        });
      else await db.delete(schema.releasePr).where(key);
      await audit(
        release.workspaceId,
        ctx.user.id,
        input.included ? "release.add_pr" : "release.remove_pr",
        release.id,
        { repo: repo.fullName, number: input.number },
      );
    }),
  get: protectedProcedure.input(idInput).query(async ({ ctx, input }) => {
    const release = await releaseFor(ctx.user.id, input.id);
    const repos = await visible(ctx.user.id, release.workspaceId);
    const rows = await db
      .select({
        link: schema.releasePr,
        pr: schema.pullRequest,
        repo: schema.repository.fullName,
      })
      .from(schema.releasePr)
      .innerJoin(
        schema.repository,
        eq(schema.repository.id, schema.releasePr.repoId),
      )
      .innerJoin(
        schema.pullRequest,
        and(
          eq(schema.pullRequest.repoId, schema.releasePr.repoId),
          eq(schema.pullRequest.number, schema.releasePr.prNumber),
        ),
      )
      .where(eq(schema.releasePr.releaseId, release.id));
    const items = [];
    for (const row of rows.filter((r) =>
      repos.some((repo) => repo.id === r.pr.repoId),
    )) {
      const cycles = await db
        .select()
        .from(schema.reviewCycle)
        .where(
          and(
            eq(schema.reviewCycle.repoId, row.pr.repoId),
            eq(schema.reviewCycle.prNumber, row.pr.number),
            isNull(schema.reviewCycle.completedAt),
            isNull(schema.reviewCycle.cancelledAt),
          ),
        );
      items.push({
        ...row,
        cycles,
        readiness: currentReadiness(row.link.readiness, row.pr.headSha),
      });
    }
    return { release, items, incomplete: items.length !== rows.length };
  }),
  refresh: protectedProcedure
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const release = await releaseFor(ctx.user.id, input.id);
      await assertTeam(release.workspaceId);
      const repos = await visible(ctx.user.id, release.workspaceId);
      const links = await db
        .select()
        .from(schema.releasePr)
        .where(eq(schema.releasePr.releaseId, release.id));
      for (const link of links.filter((l) =>
        repos.some((r) => r.id === l.repoId),
      )) {
        await db.transaction(async (tx) => {
          const now = new Date();
          const changed = await tx
            .update(schema.releasePr)
            .set({ refreshRequestedAt: now })
            .where(
              and(
                eq(schema.releasePr.releaseId, release.id),
                eq(schema.releasePr.repoId, link.repoId),
                eq(schema.releasePr.prNumber, link.prNumber),
                or(
                  isNull(schema.releasePr.refreshRequestedAt),
                  lt(
                    schema.releasePr.refreshRequestedAt,
                    new Date(now.getTime() - 60000),
                  ),
                ),
              ),
            )
            .returning({ repoId: schema.releasePr.repoId });
          if (changed.length)
            await tx
              .insert(schema.jobs)
              .values({
                type: "release_readiness",
                payload: {
                  releaseId: release.id,
                  repoId: link.repoId,
                  number: link.prNumber,
                  userId: ctx.user.id,
                },
              });
        });
      }
    }),
  evidence: protectedProcedure
    .input(
      ws.extend({
        prs: z
          .array(
            z.object({ repo: z.string(), number: z.number().int().positive() }),
          )
          .min(1)
          .max(100),
        format: z.enum(["json", "csv"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertCan(ctx.user.id, input.workspaceId, "audit.read");
      await assertTeam(input.workspaceId);
      const evidence = [];
      const audits = [];
      let truncated = false;
      let budget = 2000;
      for (const pick of input.prs) {
        const repo = await repoForUser(ctx.user.id, pick.repo);
        if (repo.workspaceId !== input.workspaceId)
          throw new TRPCError({ code: "NOT_FOUND" });
        const perPr = Math.min(500, budget);
        const rows = await db
          .select()
          .from(schema.reviewEvidence)
          .where(
            and(
              eq(schema.reviewEvidence.repoId, repo.id),
              eq(schema.reviewEvidence.prNumber, pick.number),
            ),
          )
          .orderBy(desc(schema.reviewEvidence.occurredAt))
          .limit(perPr + 1);
        if (rows.length > perPr) truncated = true;
        evidence.push({
          repo: repo.fullName,
          number: pick.number,
          url: `https://github.com/${repo.fullName}/pull/${pick.number}`,
          snapshots: rows.slice(0, perPr),
          missing: rows.length
            ? []
            : ["No review or merge evidence was collected for this PR."],
        });
        budget -= Math.min(rows.length, perPr);
        const auditLimit = Math.min(500, budget);
        const events = await db
          .select()
          .from(schema.auditLog)
          .where(
            and(
              eq(schema.auditLog.workspaceId, input.workspaceId),
              eq(schema.auditLog.target, `${repo.fullName}#${pick.number}`),
            ),
          )
          .orderBy(desc(schema.auditLog.at))
          .limit(auditLimit + 1);
        if (events.length > auditLimit) truncated = true;
        audits.push(...events.slice(0, auditLimit));
        budget -= Math.min(events.length, auditLimit);
      }
      const report = {
        exportedAt: new Date().toISOString(),
        scope:
          "Collected evidence. Not a compliance certification or tamper-proof record.",
        truncated,
        limits:
          "Up to 500 records per PR and 2,000 records per export. Use smaller PR selections for complete exports.",
        evidence,
        audits,
      };
      await audit(input.workspaceId, ctx.user.id, "evidence.export", null, {
        count: input.prs.length,
        format: input.format,
      });
      if (input.format === "json")
        return {
          filename: "review-evidence.json",
          mime: "application/json",
          content: JSON.stringify(report, null, 2),
        };
      const csv = [
        [
          "repository",
          "pr",
          "url",
          "kind",
          "occurred_at",
          "collected_at",
          "actor",
          "reviewed_sha",
          "merge_sha",
          "reviews",
          "checks",
          "gaps",
        ]
          .map(csvCell)
          .join(","),
      ];
      for (const entry of evidence) {
        if (!entry.snapshots.length)
          csv.push(
            [
              entry.repo,
              entry.number,
              entry.url,
              "missing",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              entry.missing,
            ]
              .map(csvCell)
              .join(","),
          );
        for (const item of entry.snapshots)
          csv.push(
            [
              entry.repo,
              entry.number,
              entry.url,
              item.kind,
              item.occurredAt.toISOString(),
              item.collectedAt.toISOString(),
              item.data.actor,
              item.data.headSha,
              item.data.mergeSha,
              item.data.reviews,
              item.data.checks,
              item.data.gaps,
            ]
              .map(csvCell)
              .join(","),
          );
      }
      for (const event of audits)
        csv.push(
          [
            "",
            "",
            event.target,
            "docks_audit",
            event.at.toISOString(),
            "",
            event.actorId,
            "",
            "",
            event.action,
            "",
            event.meta,
          ]
            .map(csvCell)
            .join(","),
        );
      csv.push(
        [
          "",
          "",
          "",
          "report_limits",
          report.exportedAt,
          "",
          "",
          "",
          "",
          "",
          "",
          `${report.scope} ${truncated ? "Results were truncated. Limit: 500 records per PR and 2,000 per export." : ""}`,
        ]
          .map(csvCell)
          .join(","),
      );
      return {
        filename: "review-evidence.csv",
        mime: "text/csv",
        content: csv.join("\r\n"),
      };
    }),
});
