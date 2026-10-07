import OpenAI from "openai";
import { GUIDE_MODEL, renderDiff, type GuideFile } from "./guide.js";

/**
 * "Ask the PR" (plan M6): one call per question with the diff as context.
 * No streaming; answers cite `path:line` so the UI can link to the line.
 */

const SYSTEM = `You answer a code reviewer's questions about one GitHub pull request.
Use only the PR description and diff given. If the diff doesn't show enough to answer, say what's missing instead of guessing.
When you point at code, cite it as path:line using the new-file line number (for example src/auth/login.ts:42).
Be brief: a few sentences or a short list.`;

let client: OpenAI | null = null;

export async function askPr(input: {
  title: string;
  body: string | null;
  files: GuideFile[];
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<string> {
  client ??= new OpenAI();
  const res = await client.responses.create({
    model: GUIDE_MODEL,
    reasoning: { effort: "low" },
    max_output_tokens: 4000,
    input: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Pull request: ${input.title}\n\n${input.body?.trim() || "No description."}\n\nDiff:\n\n${renderDiff(input.files)}`,
      },
      ...input.history.slice(-10),
      { role: "user", content: input.question },
    ],
  });
  return res.output_text.trim() || "I couldn't produce an answer for that.";
}
