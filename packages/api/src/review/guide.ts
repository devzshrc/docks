import OpenAI from "openai";
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

const GuideOutput = z.object({
  summary: z.string().describe("2-3 sentences: what this PR changes and why"),
  steps: z
    .array(
      z.object({
        title: z.string().describe("Short name, e.g. 'Schema change'"),
        why: z.string().describe("One sentence: what the reviewer should look for in this step"),
        files: z.array(z.string()).describe("Exact file paths from the diff"),
      }),
    )
    .describe("3-6 logical steps in the order a reviewer should read them"),
  checklist: z
    .array(
      z.object({
        question: z.string().describe("A specific question only a human reviewer can answer"),
        files: z.array(z.string()).describe("Exact file paths the question is about"),
      }),
    )
    .describe("3-7 concrete things to verify"),
});

const SYSTEM = `You help a human reviewer get through a GitHub pull request faster. You do not review the code yourself.

Group the changed files into a short guided tour of 3-6 logical steps. Order the steps so each builds on the one before (for example: data model, then API, then UI, then tests). Every non-generated file should appear in exactly one step. Lockfiles and generated files can be left out.

Then write 3-7 checklist questions the reviewer must answer themselves. Make them specific to this diff: edge cases, migrations on existing data, auth and permissions, error handling, backwards compatibility, missing tests. Avoid generic advice that would apply to any PR.

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
  model?: string;
  effort?: "minimal" | "low" | "medium" | "high";
}

let client: OpenAI | null = null;

/** Same rendering the guide model sees; the eval judge reuses it. */
export function renderDiff(files: GuideFile[]) {
  return files
    .slice(0, MAX_GUIDE_FILES)
    .map((f) => {
      const head = `### ${f.filename} (${f.tier}, +${f.additions} -${f.deletions})`;
      if (f.tier === "noise") return `${head}\n(generated or lockfile, patch omitted)`;
      const patch = f.patch ?? "(binary or too large for GitHub to inline)";
      return patch.length > MAX_PATCH_CHARS
        ? `${head}\n${patch.slice(0, MAX_PATCH_CHARS)}\n[patch truncated at ${MAX_PATCH_CHARS} characters]`
        : `${head}\n${patch}`;
    })
    .join("\n\n");
}

/** Drop any path the model invented, and steps or questions left empty by that. */
export function validateGuide(raw: z.infer<typeof GuideOutput>, files: GuideFile[]): Guide {
  const known = new Set(files.map((f) => f.filename));
  const keep = (paths: string[]) => [...new Set(paths.filter((p) => known.has(p)))];
  return {
    source: "ai",
    summary: raw.summary.trim(),
    steps: raw.steps
      .map((s) => ({ title: s.title.trim(), why: s.why.trim(), files: keep(s.files) }))
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
  client ??= new OpenAI(); // OPENAI_API_KEY
  const omitted = input.files.length - MAX_GUIDE_FILES;
  const res = await client.responses.parse({
    model: options.model ?? GUIDE_MODEL,
    reasoning: { effort: options.effort ?? "low" },
    max_output_tokens: 16000,
    input: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          `Pull request: ${input.title}`,
          input.body?.trim() ? `Description:\n${input.body.trim()}` : "No description.",
          omitted > 0
            ? `Only the first ${MAX_GUIDE_FILES} of ${input.files.length} files are included.`
            : "",
          `Diff:\n\n${renderDiff(input.files)}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    text: { format: zodTextFormat(GuideOutput, "review_guide") },
  });

  const refusal = res.output
    .flatMap((o) => (o.type === "message" ? o.content : []))
    .find((c) => c.type === "refusal");
  if (refusal) throw new Error("Guide request was declined");
  if (res.status === "incomplete") {
    throw new Error(`Guide output was cut off (${res.incomplete_details?.reason ?? "incomplete"})`);
  }
  if (!res.output_parsed) throw new Error("Guide output did not match the schema");

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
}

/** No-AI guide: one step per top-level folder, riskiest first, no checklist. */
export function fallbackGuide(files: GuideFile[], reason: string): Guide {
  const groups = new Map<string, string[]>();
  for (const f of files) {
    if (f.tier === "noise") continue;
    const parts = f.filename.split("/");
    const key = parts.length > 2 ? parts.slice(0, 2).join("/") : parts.length === 2 ? parts[0]! : "root";
    groups.set(key, [...(groups.get(key) ?? []), f.filename]);
  }
  return {
    source: "fallback",
    summary: reason,
    steps: [...groups].map(([dir, paths]) => ({ title: dir, why: "", files: paths })),
    checklist: [],
  };
}

/** Generate and cache the guide for one PR head commit (job handler body). */
export async function generateGuideFor(repoId: number, number: number, headSha: string) {
  const [repo] = await db
    .select({ fullName: schema.repository.fullName, aiEnabled: schema.repository.aiEnabled })
    .from(schema.repository)
    .where(eq(schema.repository.id, repoId))
    .limit(1);
  if (!repo?.aiEnabled) return;

  const [pull] = await db
    .select({ title: schema.pullRequest.title, body: schema.pullRequest.body, headSha: schema.pullRequest.headSha })
    .from(schema.pullRequest)
    .where(and(eq(schema.pullRequest.repoId, repoId), eq(schema.pullRequest.number, number)))
    .limit(1);
  // A newer push already superseded this commit; its own job will run.
  if (!pull || pull.headSha !== headSha) return;

  const [existing] = await db
    .select({ headSha: schema.reviewGuide.headSha })
    .from(schema.reviewGuide)
    .where(guideKey(repo.fullName, number, headSha))
    .limit(1);
  if (existing) return;

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

  const result = await buildGuide({ title: pull.title, body: pull.body, files }).catch(
    (err: unknown) => {
      throw retryable(err) ? err : new PermanentJobError((err as Error).message);
    },
  );
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

/** Rate limits, overload, server and network errors are worth retrying; the rest aren't. */
function retryable(err: unknown): boolean {
  if (err instanceof OpenAI.APIConnectionError) return true;
  if (err instanceof OpenAI.APIError) {
    return err.status === 408 || err.status === 409 || err.status === 429 || (err.status ?? 0) >= 500;
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
