import { sendDigest } from "@docks/api";

/** Post the daily stuck-PR digest for a workspace (plan.md §5.4). */
export async function slackDigest(payload: unknown): Promise<void> {
  const { workspaceId, date } = payload as { workspaceId: string; date: string };
  await sendDigest(workspaceId, date);
}
