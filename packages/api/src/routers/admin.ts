import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { gte } from "drizzle-orm";
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
});
