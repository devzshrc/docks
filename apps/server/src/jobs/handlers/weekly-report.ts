import { sendWeeklyReport } from "@docks/api";

/** Monday team report to Slack and admins' email (plan M7). */
export async function weeklyReport(payload: unknown): Promise<void> {
  const { workspaceId, date } = payload as { workspaceId: string; date: string };
  await sendWeeklyReport(workspaceId, date);
}
