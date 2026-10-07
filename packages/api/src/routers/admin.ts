import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { computeMetrics } from "../analytics.js";
import { protectedProcedure, router } from "../trpc.js";

/** Internal product metrics (plan M8). ADMIN_EMAILS is a comma-separated allowlist. */
function assertAdmin(email: string) {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!admins.includes(email.toLowerCase())) throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
}

export const adminRouter = router({
  metrics: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx.user.email);
    const since = new Date(Date.now() - 60 * 24 * 3_600_000);
    const events = await db
      .select({ userId: schema.event.userId, name: schema.event.name, at: schema.event.at })
      .from(schema.event)
      .where(gte(schema.event.at, since));
    return computeMetrics(events);
  }),

  /**
   * One row per workspace for the accounts scatterplot.
   * - seats: members
   * - monthlyRevenue: seats × TEAM_SEAT_PRICE_USD on Team, 0 on Free
   * - retention: share of members active (opened the board/PR or reviewed) in the last 28 days
   */
  accounts: protectedProcedure.query(async ({ ctx }): Promise<Account[]> => {
    assertAdmin(ctx.user.email);
    const price = Number(process.env.TEAM_SEAT_PRICE_USD ?? 12);
    const since = new Date(Date.now() - 28 * 24 * 3_600_000);
    const [workspaces, seats, active] = await Promise.all([
      db.select({ id: schema.workspace.id, name: schema.workspace.name, plan: schema.workspace.plan }).from(schema.workspace),
      db
        .select({ workspaceId: schema.workspaceMember.workspaceId, n: count() })
        .from(schema.workspaceMember)
        .groupBy(schema.workspaceMember.workspaceId),
      db
        .selectDistinct({ workspaceId: schema.event.workspaceId, userId: schema.event.userId })
        .from(schema.event)
        .where(
          and(
            gte(schema.event.at, since),
            inArray(schema.event.name, ["board_viewed", "pr_opened", "review_submitted"]),
          ),
        ),
    ]);
    const seatCount = new Map(seats.map((s) => [s.workspaceId, s.n]));
    const members = await db
      .select({ workspaceId: schema.workspaceMember.workspaceId, userId: schema.workspaceMember.userId })
      .from(schema.workspaceMember);
    const isMember = new Set(members.map((m) => `${m.workspaceId}:${m.userId}`));
    const activeCount = new Map<string, number>();
    for (const a of active) {
      if (a.workspaceId && a.userId && isMember.has(`${a.workspaceId}:${a.userId}`)) {
        activeCount.set(a.workspaceId, (activeCount.get(a.workspaceId) ?? 0) + 1);
      }
    }
    return workspaces
      .map((w) => {
        const n = seatCount.get(w.id) ?? 0;
        return {
          id: w.id,
          name: w.name,
          segment: w.plan === "team" ? ("Team" as const) : ("Free" as const),
          seats: n,
          monthlyRevenue: w.plan === "team" ? n * price : 0,
          retention: n ? Math.round(((activeCount.get(w.id) ?? 0) / n) * 100) / 100 : 0,
        };
      })
      .filter((a) => a.seats > 0);
  }),
});

/** A workspace as a customer account (admin analytics). */
export interface Account {
  id: string;
  name: string;
  segment: "Free" | "Team";
  seats: number;
  /** USD per month */
  monthlyRevenue: number;
  /** 0–1: share of seats active in the last 28 days */
  retention: number;
}
