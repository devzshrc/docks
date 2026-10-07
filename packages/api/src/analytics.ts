import { db, schema } from "@docks/db";
import { and, eq, gte, sql } from "drizzle-orm";

/** Product analytics (plan M8). Never throws: tracking must not break the action it records. */

export type EventName =
  | "signed_up"
  | "workspace_created"
  | "github_installed"
  | "github_connected"
  | "board_viewed"
  | "pr_opened"
  | "guide_viewed"
  | "review_submitted"
  | "merged"
  | "issue_created";

export async function track(
  userId: string | null,
  workspaceId: string | null,
  name: EventName,
  props?: Record<string, unknown>,
) {
  try {
    await db.insert(schema.event).values({ userId, workspaceId, name, props: props ?? null });
  } catch (err) {
    console.error(`[analytics] ${name} not recorded: ${(err as Error).message}`);
  }
}

/** For views that refetch often: at most one event per user, name and key per UTC day. */
export async function trackDaily(userId: string, workspaceId: string | null, name: EventName, key = "") {
  try {
    const day = new Date(new Date().toISOString().slice(0, 10));
    const [seen] = await db
      .select({ id: schema.event.id })
      .from(schema.event)
      .where(
        and(
          eq(schema.event.userId, userId),
          eq(schema.event.name, name),
          gte(schema.event.at, day),
          sql`coalesce(${schema.event.props}->>'key', '') = ${key}`,
        ),
      )
      .limit(1);
    if (!seen) await track(userId, workspaceId, name, key ? { key } : undefined);
  } catch (err) {
    console.error(`[analytics] ${name} not recorded: ${(err as Error).message}`);
  }
}

// ---- Metrics (pure) ----------------------------------------------------------------

export interface EventRow {
  userId: string | null;
  name: string;
  at: Date;
}

const DAY = 24 * 3_600_000;

function weekKey(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

/**
 * Beta metrics from plan §12:
 *  - activation: signed up, created a workspace and connected GitHub within 24h
 *  - weekly active reviewers: people who opened a PR or submitted a review that week
 *  - reviews submitted in the app per week
 */
export function computeMetrics(events: EventRow[], now = new Date(), weeks = 8) {
  const byUser = new Map<string, Map<string, Date>>(); // user -> first time of each event
  for (const e of events) {
    if (!e.userId) continue;
    const m = byUser.get(e.userId) ?? new Map<string, Date>();
    const prev = m.get(e.name);
    if (!prev || e.at < prev) m.set(e.name, e.at);
    byUser.set(e.userId, m);
  }
  const signups = [...byUser.values()].filter((m) => m.has("signed_up") && now.getTime() - m.get("signed_up")!.getTime() <= 30 * DAY);
  const activated = signups.filter((m) => {
    const t = m.get("signed_up")!.getTime();
    const within = (name: string) => m.has(name) && m.get(name)!.getTime() - t <= DAY;
    return within("workspace_created") && (within("github_installed") || within("github_connected"));
  });

  const weekly = new Map<string, { active: Set<string>; reviews: number }>();
  for (let i = weeks - 1; i >= 0; i--) weekly.set(weekKey(new Date(now.getTime() - i * 7 * DAY)), { active: new Set(), reviews: 0 });
  for (const e of events) {
    const w = weekly.get(weekKey(e.at));
    if (!w || !e.userId) continue;
    if (e.name === "review_submitted" || e.name === "pr_opened") w.active.add(e.userId);
    if (e.name === "review_submitted") w.reviews++;
  }

  return {
    signups30d: signups.length,
    activated30d: activated.length,
    activationRate: signups.length ? Math.round((activated.length / signups.length) * 100) : null,
    weeks: [...weekly].map(([week, w]) => ({ week, activeReviewers: w.active.size, reviews: w.reviews })),
  };
}
