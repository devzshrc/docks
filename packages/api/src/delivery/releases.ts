import { publish } from "../live.js";
import { db, schema, type ReadinessSnapshot } from "@docks/db";
import { and, eq } from "drizzle-orm";
import { repoForUser } from "../access.js";
import { assertTeam } from "../plans.js";
import { githubAs } from "../review/github-user.js";
import { computeMergeReadiness } from "../review/merge-readiness.js";

export async function refreshReleaseReadiness(input: {
  releaseId: string;
  repoId: number;
  number: number;
  userId: string;
}) {
  const [row] = await db
    .select({
      fullName: schema.repository.fullName,
      workspaceId: schema.release.workspaceId,
    })
    .from(schema.releasePr)
    .innerJoin(
      schema.release,
      eq(schema.release.id, schema.releasePr.releaseId),
    )
    .innerJoin(
      schema.repository,
      eq(schema.repository.id, schema.releasePr.repoId),
    )
    .where(
      and(
        eq(schema.releasePr.releaseId, input.releaseId),
        eq(schema.releasePr.repoId, input.repoId),
        eq(schema.releasePr.prNumber, input.number),
      ),
    );
  if (!row) return;
  // Permission is checked at execution time, not only when the job was queued.
  const repo = await repoForUser(input.userId, row.fullName);
  if (repo.workspaceId !== row.workspaceId) return;
  await assertTeam(row.workspaceId);
  const snapshot = await githubAs(input.userId)
    .mergeSnapshot(row.fullName, input.number)
    .catch(() => null);
  await db
    .update(schema.releasePr)
    .set({ readiness: computeMergeReadiness(snapshot) })
    .where(
      and(
        eq(schema.releasePr.releaseId, input.releaseId),
        eq(schema.releasePr.repoId, input.repoId),
        eq(schema.releasePr.prNumber, input.number),
      ),
    );
  await publish(row.workspaceId, { t: "release" });
}
export function currentReadiness(
  snapshot: ReadinessSnapshot | null,
  headSha: string,
  now = new Date(),
) {
  if (
    !snapshot ||
    !Number.isFinite(new Date(snapshot.checkedAt).getTime()) ||
    snapshot.headSha !== headSha ||
    now.getTime() - new Date(snapshot.checkedAt).getTime() > 15 * 60000
  )
    return {
      state: "unknown" as const,
      headSha,
      checkedAt: snapshot?.checkedAt ?? null,
      blockers: [],
      warnings: ["Refresh GitHub requirements for the current commit."],
    };
  return snapshot;
}
