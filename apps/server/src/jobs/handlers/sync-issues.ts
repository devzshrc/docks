import { syncIssue as one, syncRepoIssues } from "@docks/api";

/** Backfill a repo's issue mirror. */
export async function syncIssues(payload: unknown): Promise<void> {
  const { repoId } = payload as { repoId: number };
  await syncRepoIssues(repoId);
}

/** Refresh one issue. */
export async function syncIssue(payload: unknown): Promise<void> {
  const { repoId, number } = payload as { repoId: number; number: number };
  await one(repoId, number);
}
