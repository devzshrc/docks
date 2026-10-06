import { generateGuideFor } from "@docks/api";

/** Build and cache the AI guide for a PR head commit (plan.md §6.3). */
export async function generateGuide(payload: unknown): Promise<void> {
  const { repoId, number, headSha } = payload as { repoId: number; number: number; headSha: string };
  await generateGuideFor(repoId, number, headSha);
}
