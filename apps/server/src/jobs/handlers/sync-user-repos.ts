import { PermanentJobError, syncUserRepos as run } from "@docks/api";

/** Refresh which repos a person can see on GitHub (M2). */
export async function syncUserRepos(payload: unknown): Promise<void> {
  const { userId } = payload as { userId: string };
  try {
    await run(userId);
  } catch (err) {
    // Unlinked or expired GitHub connection: retrying won't help until they reconnect.
    if ((err as { code?: string }).code === "PRECONDITION_FAILED") throw new PermanentJobError((err as Error).message);
    throw err;
  }
}
