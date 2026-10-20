import { inSpan, logEvent } from "../logger.js";
import OpenAI from "openai";
import { recordAiCall, type AiContext, type AiOutcome } from "../telemetry.js";
import { zodTextFormat } from "openai/helpers/zod";
import { db, schema } from "@docks/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { PermanentJobError } from "../jobs.js";
import type { Guide, RiskTier } from "./types.js";

/**
 * AI review guide — plan.md §6.3.
 * Structured output (summary, steps, checklist), cached per head SHA,
 * falls back to folder grouping on any failure.
 */

/** Override with OPENAI_GUIDE_MODEL; pick by running the guide eval (plan.md §14.2). */
export const GUIDE_MODEL = process.env.OPENAI_GUIDE_MODEL ?? "gpt-6-astra";

/** Per-file patch cap so one huge file can't blow up cost. Marked, never silent. */
const MAX_PATCH_CHARS = 12_000;
/** Plan §14.4: one call handles up to this many files; beyond that we say so. */
export const MAX_GUIDE_FILES = 100;
/** Beyond these, no AI tour at all: cost and quality both fall off a cliff. */
export const MAX_AI_FILES = 500;
export const MAX_AI_CHANGED_LINES = 20_000;
/** Chunks generated at once for big PRs. */
const CHUNK_CONCURRENCY = 3;

export const TOO_LARGE_REASON =
  "Too large for a guided tour. Files are grouped by folder, riskiest first.";

export function tooLargeForGuide(
  files: { additions: number; deletions: number }[],
): boolean {
  const lines = files.reduce((n, f) => n + f.additions + f.deletions, 0);
  return files.length > MAX_AI_FILES || lines > MAX_AI_CHANGED_LINES;
}

const GuideOutput = z.object({
  summary: z.string().describe("2-3 sentences: what this PR changes and why"),
  steps: z
    .array(
      z.object({
        title: z.string().describe("Short name, e.g. 'Schema change'"),
        why: z
          .string()
          .describe(
            "One sentence: what the reviewer should look for in this step",
          ),
        files: z.array(z.string()).describe("Exact file paths from the diff"),
      }),
    )
    .describe("3-6 logical steps in the order a reviewer should read them"),
  checklist: z
    .array(
      z.object({
        question: z
          .string()
          .describe("A specific question only a human reviewer can answer"),
        files: z
          .array(z.string())
          .describe("Exact file paths the question is about"),
      }),
    )
    .describe("3-7 concrete things to verify"),
});

const SYSTEM = `You help a human reviewer get through a GitHub pull request faster. You do not review the code yourself.

Group the changed files into a short guided tour of 3-6 logical steps. Order the steps so each builds on the one before (for example: data model, then API, then UI, then tests). Every non-generated file should appear in exactly one step. Lockfiles and generated files can be left out.

Then write 3-7 checklist questions the reviewer must answer themselves. Make them specific to this diff: edge cases, migrations on existing data, auth and permissions, error handling, backwards compatibility, missing tests. Avoid generic advice that would apply to any PR.

Good checklist questions name the code they are about, for example:
- "Does the backfill in migrations/0042_add_status.sql handle rows where status is NULL?"
- "routes/admin.ts now accepts a member role: is that intended for every admin endpoint?"
Bad: "Are there enough tests?" or "Is error handling correct?" Every question must list at least one file.

Use file paths exactly as given. Do not write review comments, praise, or verdicts.`;

export interface GuideFile {
  filename: string;
  tier: RiskTier;
  patch?: string | null;
  additions: number;
  deletions: number;
}

export interface GeneratedGuide {
  guide: Guide;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** File paths the model referenced that aren't in the PR (removed by validateGuide). */
  invalidPaths: string[];
}

export interface GuideOptions {
  telemetry?: AiContext;
  model?: string;
  effort?: "minimal" | "low" | "medium" | "high";
  /** Big PRs: this call sees one chunk; list the rest so it knows the whole shape. */
  otherFiles?: string[];
}

let client: OpenAI | null = null;

/**
 * Cut a patch to `max` characters without hiding where it changed: every hunk
 * header survives and each hunk keeps its first lines, up to an equal share.
 */
export function truncatePatch(patch: string, max: number): string {
  if (patch.length <= max) return patch;
  const hunks: string[][] = [];
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@") || !hunks.length) hunks.push([]);
    hunks[hunks.length - 1]!.push(line);
  }
  const share = Math.max(200, Math.floor(max / hunks.length));
  const out: string[] = [];
  let omitted = 0;
  for (const [header, ...body] of hunks) {
    out.push(header!);
    let used = header!.length;
    let i = 0;
    for (; i < body.length && used + body[i]!.length + 1 <= share; i++) {
      out.push(body[i]!);
      used += body[i]!.length + 1;
    }
    if (i < body.length) {
      omitted += body.length - i;
      out.push(`[… ${body.length - i} lines of this hunk omitted]`);
    }
  }
  return `${out.join("\n")}\n[patch truncated: ${omitted} lines omitted, all ${hunks.length} hunk headers kept]`;
}

/** Same rendering the guide model sees; the eval judge reuses it. */
export function renderDiff(files: GuideFile[]) {
  return files
    .slice(0, MAX_GUIDE_FILES)
    .map((f) => {
      const head = `### ${f.filename} (${f.tier}, +${f.additions} -${f.deletions})`;
      if (f.tier === "noise")
        return `${head}\n(generated or lockfile, patch omitted)`;
      const patch = f.patch ?? "(binary or too large for GitHub to inline)";
      return `${head}\n${truncatePatch(patch, MAX_PATCH_CHARS)}`;
    })
    .join("\n\n");
}

/** Drop any path the model invented, and steps or questions left empty by that. */
export function validateGuide(
  raw: z.infer<typeof GuideOutput>,
  files: GuideFile[],
): Guide {
  const known = new Set(files.map((f) => f.filename));
  const keep = (paths: string[]) => [
    ...new Set(paths.filter((p) => known.has(p))),
  ];
  return {
    source: "ai",
    summary: raw.summary.trim(),
    steps: raw.steps
      .map((s) => ({
        title: s.title.trim(),
        why: s.why.trim(),
        files: keep(s.files),
      }))
      .filter((s) => s.files.length > 0),
    checklist: raw.checklist
      .map((c) => ({ question: c.question.trim(), files: keep(c.files) }))
      .filter((c) => c.question.length > 0),
  };
}

/** One structured-output call. Throws on API errors, refusals, or unparseable output. */
export async function buildGuide(
  input: {
    title: string;
    body: string | null;
    files: GuideFile[];
  },
  options: GuideOptions = {},
): Promise<GeneratedGuide> {
  const started = performance.now();
  let outcome: AiOutcome = "failed";
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  let model = options.model ?? GUIDE_MODEL;
  try {
    client ??= new OpenAI(); // OPENAI_API_KEY
    const omitted = input.files.length - MAX_GUIDE_FILES;
    const provider = client;
    const res = await inSpan("ai.guide", () =>
      provider.responses.parse({
        model: options.model ?? GUIDE_MODEL,
        reasoning: { effort: options.effort ?? "low" },
        max_output_tokens: 16000,
        input: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              `Pull request: ${input.title}`,
              input.body?.trim()
                ? `Description:\n${input.body.trim()}`
                : "No description.",
              omitted > 0
                ? `Only the first ${MAX_GUIDE_FILES} of ${input.files.length} files are included.`
                : "",
              options.otherFiles?.length
                ? `This is one part of a larger PR. Guide only the files in the diff below. The rest of the PR, for context:\n${options.otherFiles.join("\n")}`
                : "",
              `Diff:\n\n${renderDiff(input.files)}`,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
        text: { format: zodTextFormat(GuideOutput, "review_guide") },
      }),
    );

    usage = res.usage;
    model = res.model;
    const refusal = res.output
      .flatMap((o) => (o.type === "message" ? o.content : []))
      .find((c) => c.type === "refusal");
    if (refusal) {
      outcome = "refused";
      throw new Error("Guide request was declined");
    }
    if (res.status === "incomplete") {
      outcome = "incomplete";
      throw new Error(
        `Guide output was cut off (${res.incomplete_details?.reason ?? "incomplete"})`,
      );
    }
    if (!res.output_parsed) {
      outcome = "unparseable";
      throw new Error("Guide output did not match the schema");
    }
    outcome = "ok";

    const known = new Set(input.files.map((f) => f.filename));
    const referenced = [
      ...res.output_parsed.steps.flatMap((st) => st.files),
      ...res.output_parsed.checklist.flatMap((c) => c.files),
    ];
    return {
      invalidPaths: [...new Set(referenced.filter((p) => !known.has(p)))],
      guide: validateGuide(res.output_parsed, input.files),
      model: res.model,
      inputTokens: res.usage?.input_tokens ?? 0,
      outputTokens: res.usage?.output_tokens ?? 0,
    };
  } finally {
    await recordAiCall({
      ...options.telemetry,
      operation: "guide",
      model,
      outcome,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      latencyMs: performance.now() - started,
    });
  }
}

/** No-AI guide: folder steps, riskiest first, kept to 3-6 steps; no checklist. */
export function fallbackGuide(files: GuideFile[], reason: string): Guide {
  const reviewable = files.filter((f) => f.tier !== "noise");
  const groups = new Map<string, string[]>();
  for (const f of reviewable) {
    const parts = f.filename.split("/");
    const key =
      parts.length > 2
        ? parts.slice(0, 2).join("/")
        : parts.length === 2
          ? parts[0]!
          : "root";
    groups.set(key, [...(groups.get(key) ?? []), f.filename]);
  }
  let steps = [...groups].map(([dir, paths]) => ({ title: dir, why: "", files: paths }));
  if (steps.length > 6) {
    // Biggest five folders keep their own step; the long tail shares one.
    steps.sort((a, b) => b.files.length - a.files.length);
    const rest = steps.slice(5);
    steps = [
      ...steps.slice(0, 5),
      { title: `Other folders (${rest.length})`, why: "", files: rest.flatMap((s) => s.files) },
    ];
  } else if (steps.length < 3 && reviewable.length >= 3) {
    // Too few folders to tour: read by risk tier instead (code, config, tests).
    const byTier = (["core", "config", "test"] as const)
      .map((tier) => ({
        title: { core: "Application code", config: "Configuration", test: "Tests" }[tier],
        why: "",
        files: reviewable.filter((f) => f.tier === tier).map((f) => f.filename),
      }))
      .filter((s) => s.files.length);
    if (byTier.length > steps.length) steps = byTier;
  }
  return { source: "fallback", summary: reason, steps, checklist: [] };
}

/** Generate and cache the guide for one PR head commit (job handler body). */
export async function generateGuideFor(
  repoId: number,
  number: number,
  headSha: string,
) {
  const [repo] = await db
    .select({
      fullName: schema.repository.fullName,
      workspaceId: schema.githubInstallation.workspaceId,
      aiEnabled: schema.repository.aiEnabled,
    })
    .from(schema.repository)
    .innerJoin(
      schema.githubInstallation,
      eq(schema.repository.installationId, schema.githubInstallation.id),
    )
    .where(eq(schema.repository.id, repoId))
    .limit(1);
  if (!repo?.aiEnabled) return;

  const [pull] = await db
    .select({
      title: schema.pullRequest.title,
      body: schema.pullRequest.body,
      headSha: schema.pullRequest.headSha,
    })
    .from(schema.pullRequest)
    .where(
      and(
        eq(schema.pullRequest.repoId, repoId),
        eq(schema.pullRequest.number, number),
      ),
    )
    .limit(1);
  // A newer push already superseded this commit; its own job will run.
  if (!pull || pull.headSha !== headSha) return;

  const [existing] = await db
    .select({ headSha: schema.reviewGuide.headSha })
    .from(schema.reviewGuide)
    .where(guideKey(repo.fullName, number, headSha))
    .limit(1);
  if (existing) {
    await recordAiCall({
      workspaceId: repo.workspaceId,
      repoId,
      operation: "guide",
      model: GUIDE_MODEL,
      outcome: "cached",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    });
    return;
  }

  const files = await db
    .select({
      filename: schema.prFile.path,
      tier: schema.prFile.tier,
      patch: schema.prFile.patch,
      additions: schema.prFile.additions,
      deletions: schema.prFile.deletions,
    })
    .from(schema.prFile)
    .where(
      and(
        eq(schema.prFile.repoId, repoId),
        eq(schema.prFile.prNumber, number),
        eq(schema.prFile.headSha, headSha),
      ),
    );
  if (!files.length) return;

  let result: GeneratedGuide | null;
  try {
    result = await generateGuide(
      { title: pull.title, body: pull.body, files },
      { telemetry: { workspaceId: repo.workspaceId, repoId } },
    );
  } catch (err) {
    throw retryable(err) ? err : new PermanentJobError((err as Error).message);
  }
  if (!result) {
    logEvent("info", "guide.skipped_too_large", { repoId, number, files: files.length });
    return;
  }
  await db
    .insert(schema.reviewGuide)
    .values({
      repo: repo.fullName,
      prNumber: number,
      headSha,
      model: result.model,
      guide: result.guide,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    })
    .onConflictDoNothing();
}

/**
 * Split files into chunks of at most MAX_GUIDE_FILES, keeping each top-level
 * folder together where it fits. Lockfiles/generated go wherever there's room.
 */
export function chunkFiles<T extends { filename: string }>(
  files: T[],
  max = MAX_GUIDE_FILES,
): T[][] {
  if (files.length <= max) return [files];
  const groups = new Map<string, T[]>();
  for (const f of files) {
    const top = f.filename.includes("/") ? f.filename.split("/")[0]! : ".";
    groups.set(top, [...(groups.get(top) ?? []), f]);
  }
  const chunks: T[][] = [];
  let current: T[] = [];
  for (const group of [...groups.values()].sort(
    (a, b) => b.length - a.length,
  )) {
    for (let i = 0; i < group.length; i += max) {
      const slice = group.slice(i, i + max);
      if (current.length + slice.length > max) {
        chunks.push(current);
        current = [];
      }
      current.push(...slice);
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * Whole-PR guide: one call for normal PRs; for big ones, folder chunks in
 * parallel then one merge call. Null when the PR is too large for any AI tour.
 */
export async function generateGuide(
  input: { title: string; body: string | null; files: GuideFile[] },
  options: Pick<GuideOptions, "telemetry" | "model" | "effort"> = {},
): Promise<GeneratedGuide | null> {
  const { files } = input;
  if (tooLargeForGuide(files)) return null;
  const chunks = chunkFiles(files);
  const parts = await mapLimit(chunks, CHUNK_CONCURRENCY, (chunk) => {
    const inChunk = new Set(chunk.map((f) => f.filename));
    return buildGuide(
      { ...input, files: chunk },
      {
        ...options,
        otherFiles:
          chunks.length > 1
            ? files.filter((f) => !inChunk.has(f.filename)).map((f) => `${f.filename} (${f.tier})`)
            : undefined,
      },
    );
  });
  if (parts.length === 1) return parts[0]!;
  return reduceGuides(parts, input, options).catch((err: unknown) => {
    logEvent("warn", "guide.reduce_failed", { error: (err as Error).message });
    return mergeGuides(parts, files.length);
  });
}

/** Run `fn` over `items` with at most `limit` in flight, keeping order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const MergedOutput = GuideOutput.extend({
  steps: GuideOutput.shape.steps.describe(
    "3-8 logical steps for the whole PR, in reading order; merge related part-steps",
  ),
  checklist: GuideOutput.shape.checklist.describe(
    "The 3-7 most important questions across all parts",
  ),
});

const REDUCE_SYSTEM = `You merge partial review tours of one large GitHub pull request into a single tour.
Each part covered a different set of files. Write one 2-3 sentence summary of the whole PR, then 3-8 steps in the order a reviewer should read them (merge steps from different parts when they belong together), then the 3-7 most important checklist questions. Keep every file in exactly one step. Use file paths exactly as given. Do not write review comments, praise, or verdicts.`;

/** One extra call over the parts' outputs (not the diffs) to produce a single coherent guide. */
export async function reduceGuides(
  parts: GeneratedGuide[],
  input: { title: string; body: string | null; files: GuideFile[] },
  options: Pick<GuideOptions, "telemetry" | "model"> = {},
): Promise<GeneratedGuide> {
  const started = performance.now();
  let outcome: AiOutcome = "failed";
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  let model = options.model ?? GUIDE_MODEL;
  try {
    client ??= new OpenAI();
    const provider = client;
    const res = await inSpan("ai.guide_reduce", () =>
      provider.responses.parse({
        model,
        reasoning: { effort: "low" },
        max_output_tokens: 16000,
        input: [
          { role: "system", content: REDUCE_SYSTEM },
          {
            role: "user",
            content: [
              `Pull request: ${input.title} (${input.files.length} files)`,
              input.body?.trim() ? `Description:\n${input.body.trim()}` : "No description.",
              ...parts.map((p, i) => `Part ${i + 1}:\n${JSON.stringify(p.guide)}`),
            ].join("\n\n"),
          },
        ],
        text: { format: zodTextFormat(MergedOutput, "review_guide") },
      }),
    );
    usage = res.usage;
    model = res.model;
    if (res.status === "incomplete" || !res.output_parsed) {
      outcome = res.status === "incomplete" ? "incomplete" : "unparseable";
      throw new Error("Merged guide output was unusable");
    }
    outcome = "ok";
    const guide = validateGuide(res.output_parsed, input.files);
    // Anything the merge dropped goes back in as its own step, so coverage never shrinks.
    const placed = new Set(guide.steps.flatMap((st) => st.files));
    const lost = [...new Set(parts.flatMap((p) => p.guide.steps.flatMap((st) => st.files)))].filter(
      (f) => !placed.has(f),
    );
    if (lost.length) guide.steps.push({ title: "Remaining files", why: "", files: lost });
    return {
      guide,
      model: res.model,
      inputTokens: parts.reduce((n, p) => n + p.inputTokens, 0) + (res.usage?.input_tokens ?? 0),
      outputTokens: parts.reduce((n, p) => n + p.outputTokens, 0) + (res.usage?.output_tokens ?? 0),
      invalidPaths: parts.flatMap((p) => p.invalidPaths),
    };
  } finally {
    await recordAiCall({
      ...options.telemetry,
      operation: "guide",
      model,
      outcome,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      latencyMs: performance.now() - started,
    });
  }
}

/** Combine per-chunk guides without a model call: the fallback when reduceGuides fails. */
export function mergeGuides(
  parts: GeneratedGuide[],
  totalFiles: number,
): GeneratedGuide {
  if (parts.length === 1) return parts[0]!;
  return {
    guide: {
      source: "ai",
      summary: `${parts[0]!.guide.summary} (Large PR: ${totalFiles} files, guided in ${parts.length} parts.)`,
      steps: parts.flatMap((p) => p.guide.steps),
      checklist: parts.flatMap((p) => p.guide.checklist).slice(0, 10),
    },
    model: parts[0]!.model,
    inputTokens: parts.reduce((n, p) => n + p.inputTokens, 0),
    outputTokens: parts.reduce((n, p) => n + p.outputTokens, 0),
    invalidPaths: parts.flatMap((p) => p.invalidPaths),
  };
}

/** Rate limits, overload, server and network errors are worth retrying; the rest aren't. */
function retryable(err: unknown): boolean {
  if (err instanceof OpenAI.APIConnectionError) return true;
  if (err instanceof OpenAI.APIError) {
    return (
      err.status === 408 ||
      err.status === 409 ||
      err.status === 429 ||
      (err.status ?? 0) >= 500
    );
  }
  // Missing credentials, refusals, schema mismatch: same input, same result.
  return false;
}

export function guideKey(repo: string, number: number, headSha: string) {
  return and(
    eq(schema.reviewGuide.repo, repo),
    eq(schema.reviewGuide.prNumber, number),
    eq(schema.reviewGuide.headSha, headSha),
  );
}
