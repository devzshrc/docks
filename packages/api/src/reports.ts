import { logError } from "./logger.js";
import { db, schema } from "@docks/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { decrypt } from "./crypto.js";
import { sendEmail } from "./email.js";
import { computeInsights, type Insights } from "./insights.js";
import { enqueue } from "./jobs.js";
import { insightRows } from "./routers/insights.js";

/**
 * Weekly report (plan M7): Monday, after 09:00 UTC, last 7 days of numbers to
 * Slack (if connected) and email to owners and admins. Team-level only.
 */

const clientUrl = () => process.env.CLIENT_URL ?? "http://localhost:3000";
const fmtHours = (h: number | null) => (h === null ? "—" : h < 48 ? `${h}h` : `${Math.round(h / 24)}d`);

export function weeklyText(name: string, r: Insights) {
  const lines = [
    `Weekly review report for ${name}`,
    "",
    `PRs opened: ${r.opened} · merged: ${r.merged} · still unreviewed: ${r.unreviewed}`,
    `Time to first review: median ${fmtHours(r.timeToFirstReview.medianHours)}, slowest 10% ${fmtHours(r.timeToFirstReview.p90Hours)}`,
    `Opened to merged: median ${fmtHours(r.cycleTime.medianHours)}`,
  ];
  const slow = r.repos.slice(0, 3).filter((x) => x.medianHoursToFirstReview !== null);
  if (slow.length) {
    lines.push("", "Slowest repos to first review:", ...slow.map((x) => `• ${x.repo}: ${fmtHours(x.medianHoursToFirstReview)} (${x.prs} PRs)`));
  }
  lines.push("", `Details: ${clientUrl()}/insights`);
  return lines.join("\n");
}

/** Called by the worker hourly: queue this week's report once per workspace. */
export async function scheduleWeeklyReports(now = new Date()) {
  if (now.getUTCDay() !== 1 || now.getUTCHours() < 9) return;
  const date = now.toISOString().slice(0, 10);
  const due = await db
    .select({ id: schema.workspace.id })
    .from(schema.workspace)
    .where(sql`${schema.workspace.lastWeeklyReportOn} IS DISTINCT FROM ${date}`);
  for (const w of due) await enqueue("weekly_report", { workspaceId: w.id, date });
}

export async function sendWeeklyReport(workspaceId: string, date: string) {
  const [ws] = await db
    .select({ name: schema.workspace.name, last: schema.workspace.lastWeeklyReportOn })
    .from(schema.workspace)
    .where(eq(schema.workspace.id, workspaceId));
  if (!ws || ws.last === date) return;
  // Mark first: a failed send shouldn't spam on retry.
  await db.update(schema.workspace).set({ lastWeeklyReportOn: date }).where(eq(schema.workspace.id, workspaceId));

  const repos = await db
    .select({ id: schema.repository.id, fullName: schema.repository.fullName })
    .from(schema.repository)
    .innerJoin(schema.githubInstallation, eq(schema.githubInstallation.id, schema.repository.installationId))
    .where(and(eq(schema.githubInstallation.workspaceId, workspaceId), eq(schema.repository.enabled, true)));
  if (!repos.length) return;
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 3_600_000);
  const { prs, reviews } = await insightRows(repos, from);
  const report = computeInsights(prs, reviews, { from, to, weeks: 1 });
  if (report.opened === 0 && report.merged === 0) return; // quiet week
  const text = weeklyText(ws.name, report);

  const [slack] = await db
    .select({ url: schema.slackIntegration.webhookUrlEncrypted })
    .from(schema.slackIntegration)
    .where(eq(schema.slackIntegration.workspaceId, workspaceId));
  if (slack) {
    await fetch(decrypt(slack.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch((err) => logError("report.failed", err));
  }

  const admins = await db
    .select({ email: schema.user.email })
    .from(schema.workspaceMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
    .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), inArray(schema.workspaceMember.role, ["owner", "admin"])));
  const html = `<pre style="font-family:system-ui,sans-serif;font-size:14px;white-space:pre-wrap">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</pre>`;
  for (const a of admins) {
    await sendEmail({ to: a.email, subject: `Weekly review report: ${ws.name}`, text, html }).catch((err) =>
      logError("report.failed", err),
    );
  }
}
