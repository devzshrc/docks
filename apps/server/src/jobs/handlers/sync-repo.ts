import { syncRepo as run } from "@docks/api";

/** Backfill: queue a sync_pr for every open PR in the repo. */
export async function syncRepo(payload: unknown): Promise<void> {
  const { repoId } = payload as { repoId: number };
  await run(repoId);
}
