import { runRules } from "@docks/api";

/** Apply a repo's routing rules to a PR (labels, reviewers, comment). */
export async function applyRules(payload: unknown): Promise<void> {
  const { repoId, number } = payload as { repoId: number; number: number };
  await runRules(repoId, number);
}
