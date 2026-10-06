import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod/v4";
import { renderDiff, type GuideFile } from "../../src/review/guide.js";
import type { Guide } from "../../src/review/types.js";
import type { JudgeScores } from "./types.js";

/**
 * Model-graded rubric for what the deterministic checks can't see: is the
 * tour in a sensible order, are the groups coherent, is the summary true,
 * are the questions specific and worth asking.
 *
 * Use a judge model different from (ideally stronger than) the model under
 * test, and spot-check the judge against human-scores.csv before trusting it.
 */

const score = (anchors: string) => z.number().int().min(1).max(5).describe(anchors);

const JudgeOutput = z.object({
  stepOrder: score(
    "1 = order is confusing or backwards; 3 = acceptable but some steps need context from later ones; 5 = each step builds on the previous (e.g. types/schema, then logic, then callers/UI, then tests)",
  ),
  stepGrouping: score(
    "1 = unrelated files lumped together or one file per step for no reason; 3 = mostly coherent with one or two odd placements; 5 = every step is one logical change a reviewer can hold in their head",
  ),
  summaryAccuracy: score(
    "1 = wrong or invents behaviour not in the diff; 3 = right but vague or misses the main point; 5 = correct, specific, and names the main change and why",
  ),
  checklistSpecificity: score(
    "1 = generic questions that fit any PR ('are there tests?', 'is error handling ok?'); 3 = mixed; 5 = every question names something concrete in this diff",
  ),
  checklistUsefulness: score(
    "1 = questions an experienced reviewer wouldn't need or that the diff already answers; 3 = some catch real risks; 5 = the questions target the actual risks in this change (data migration, auth, edge cases, compatibility)",
  ),
  genericQuestions: z
    .array(z.string())
    .describe("Checklist questions copied verbatim that would apply to almost any PR"),
  notes: z.string().describe("One or two sentences on the biggest problem, or 'none'"),
});

const SYSTEM = `You grade a "review guide" that an AI wrote to help a human review a GitHub pull request.

The guide has a short summary, a tour of steps (each a group of files to read in order), and a checklist of questions for the reviewer. You see the PR and the guide. Grade only the guide, not the code.

Score each criterion 1-5 using its anchors exactly. Be strict: 5 means you would not change anything. Base every judgment on the diff shown; do not assume behaviour you can't see.`;

let client: OpenAI | null = null;

export async function judgeGuide(
  pr: { title: string; body: string | null },
  files: GuideFile[],
  guide: Guide,
  model: string,
): Promise<{ scores: JudgeScores; inputTokens: number; outputTokens: number }> {
  client ??= new OpenAI();
  const res = await client.responses.parse({
    model,
    reasoning: { effort: "medium" },
    max_output_tokens: 8000,
    input: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          `# Pull request\n${pr.title}\n\n${pr.body?.trim() || "No description."}`,
          `# Files\n${files.map((f) => `- ${f.filename} (${f.tier}, +${f.additions} -${f.deletions})`).join("\n")}`,
          `# Diff\n${renderDiff(files)}`,
          `# Guide to grade\n${JSON.stringify({ summary: guide.summary, steps: guide.steps, checklist: guide.checklist }, null, 2)}`,
        ].join("\n\n"),
      },
    ],
    text: { format: zodTextFormat(JudgeOutput, "guide_grade") },
  });
  if (!res.output_parsed) throw new Error(`Judge returned no parseable grade (status ${res.status})`);
  return {
    scores: res.output_parsed,
    inputTokens: res.usage?.input_tokens ?? 0,
    outputTokens: res.usage?.output_tokens ?? 0,
  };
}
