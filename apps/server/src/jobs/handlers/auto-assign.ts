import { runAutoAssign } from "@docks/api";

/** Request suggested reviewers on a new PR that has none (plan M4). */
export async function autoAssign(payload: unknown): Promise<void> {
  const { repoId, number } = payload as { repoId: number; number: number };
  await runAutoAssign(repoId, number);
}
