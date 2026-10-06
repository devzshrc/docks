import { syncPr as run } from "@docks/api";

/** Refresh the PR mirror (pull, files, reviews, checks) and recompute its column. */
export async function syncPr(payload: unknown): Promise<void> {
  const { repoId, number } = payload as { repoId: number; number: number };
  await run(repoId, number);
}
