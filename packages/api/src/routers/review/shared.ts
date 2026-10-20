/** Helpers shared by the review router's procedure groups. */
import { trackDaily } from "../../analytics.js";
import { db, schema } from "@docks/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { repoForUser } from "../../access.js";
import { enqueue } from "../../jobs.js";
import type { BlameRange } from "../../review/github.js";
import { TOO_LARGE_REASON, fallbackGuide, guideKey, tooLargeForGuide } from "../../review/guide.js";
import { syncPr } from "../../review/sync.js";
import type { Guide, RiskTier } from "../../review/types.js";

export const TIER_ORDER: Record<RiskTier, number> = {
  core: 0,
  config: 1,
  test: 2,
  noise: 3,
};

/** Refresh the mirror right away so the UI reflects the action; webhook is the backstop. */
export async function refreshPr(repoId: number, number: number) {
  try {
    await syncPr(repoId, number);
  } catch {
    await enqueue("sync_pr", { repoId, number });
  }
}

export type GuideState =
  | { status: "pending" }
  | { status: "ready"; guide: Guide; model: string | null };

/** Must match the key order used by syncPr so enqueue() dedupes. */
export const guideJobPayload = (repoId: number, number: number, headSha: string) => ({
  repoId,
  number,
  headSha,
});

export async function loadPull(
  userId: string,
  input: { repo: string; number: number },
) {
  const repoRow = await repoForUser(userId, input.repo);
  const [pull] = await db
    .select({ headSha: schema.pullRequest.headSha })
    .from(schema.pullRequest)
    .where(
      and(
        eq(schema.pullRequest.repoId, repoRow.id),
        eq(schema.pullRequest.number, input.number),
      ),
    )
    .limit(1);
  if (!pull)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Pull request not synced yet",
    });
  return { repoRow, pull };
}

export async function guideState(
  userId: string,
  input: { repo: string; number: number },
): Promise<GuideState> {
  const { repoRow, pull } = await loadPull(userId, input);
  const [cached] = await db
    .select({
      guide: schema.reviewGuide.guide,
      model: schema.reviewGuide.model,
    })
    .from(schema.reviewGuide)
    .where(guideKey(repoRow.fullName, input.number, pull.headSha))
    .limit(1);
  if (cached) {
    void trackDaily(
      userId,
      repoRow.workspaceId,
      "guide_viewed",
      `${repoRow.fullName}#${input.number}`,
    );
    return {
      status: "ready",
      guide: cached.guide as Guide,
      model: cached.model,
    };
  }

  const files = await db
    .select({
      filename: schema.prFile.path,
      tier: schema.prFile.tier,
      additions: schema.prFile.additions,
      deletions: schema.prFile.deletions,
    })
    .from(schema.prFile)
    .where(
      and(
        eq(schema.prFile.repoId, repoRow.id),
        eq(schema.prFile.prNumber, input.number),
        eq(schema.prFile.headSha, pull.headSha),
      ),
    );
  const fallback = (reason: string): GuideState => ({
    status: "ready",
    guide: fallbackGuide(files, reason),
    model: null,
  });

  const [settings] = await db
    .select({ aiEnabled: schema.repository.aiEnabled })
    .from(schema.repository)
    .where(eq(schema.repository.id, repoRow.id))
    .limit(1);
  if (!settings?.aiEnabled) {
    return fallback(
      "The AI guide is off for this repository. Files are grouped by folder, riskiest first.",
    );
  }

  if (tooLargeForGuide(files)) return fallback(TOO_LARGE_REASON);

  // Lazy path: no job yet (e.g. guide turned on after the last push) -> queue one.
  const payload = guideJobPayload(repoRow.id, input.number, pull.headSha);
  const [job] = await db
    .select({ status: schema.jobs.status })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.type, "generate_guide"),
        sql`${schema.jobs.payload} = ${JSON.stringify(payload)}::jsonb`,
      ),
    )
    .orderBy(desc(schema.jobs.id))
    .limit(1);
  if (job?.status === "failed" || job?.status === "done") {
    // "done" without a cached guide means it was skipped (no files) or lost a race.
    return fallback(
      "The AI guide isn't available for this commit. Files are grouped by folder, riskiest first.",
    );
  }
  if (!job) await enqueue("generate_guide", payload);
  return { status: "pending" };
}

export const lineComment = z.object({
  path: z.string(),
  line: z.number().int().positive(),
  side: z.enum(["LEFT", "RIGHT"]),
  startLine: z.number().int().positive().optional(),
  body: z.string().trim().min(1).max(65_000),
});

export async function repoDetails(repoId: number) {
  const [r] = await db
    .select({
      installationId: schema.repository.installationId,
      checklistTemplate: schema.repository.checklistTemplate,
    })
    .from(schema.repository)
    .where(eq(schema.repository.id, repoId));
  if (!r)
    throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
  return r;
}

export const checklistTemplateOf = async (repoId: number) =>
  (await repoDetails(repoId)).checklistTemplate;

export async function headShaOf(repoId: number, number: number) {
  const [p] = await db
    .select({
      headSha: schema.pullRequest.headSha,
      title: schema.pullRequest.title,
      body: schema.pullRequest.body,
    })
    .from(schema.pullRequest)
    .where(
      and(
        eq(schema.pullRequest.repoId, repoId),
        eq(schema.pullRequest.number, number),
      ),
    );
  if (!p)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Pull request not synced yet",
    });
  return p;
}

export async function recordVisit(
  userId: string,
  repoRow: { id: number; fullName: string },
  number: number,
  headSha: string,
) {
  await db
    .insert(schema.reviewVisit)
    .values({
      userId,
      repo: repoRow.fullName,
      prNumber: number,
      reviewedSha: headSha,
    })
    .onConflictDoUpdate({
      target: [
        schema.reviewVisit.userId,
        schema.reviewVisit.repo,
        schema.reviewVisit.prNumber,
      ],
      set: { reviewedSha: headSha },
    });
}

export const repo = z.string().regex(/^[\w.-]+\/[\w.-]+$/);
export const pr = z.object({ repo, number: z.number().int().positive() });

export const mergeBases = new Map<string, string>();
export const blameCache = new Map<string, BlameRange[]>();
/** Insert, evicting the oldest entry past 300. */
export function remember<V>(map: Map<string, V>, key: string, value: V) {
  if (map.size >= 300) map.delete(map.keys().next().value!);
  map.set(key, value);
}
