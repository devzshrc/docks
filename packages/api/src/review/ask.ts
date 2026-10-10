import { inSpan } from "../logger.js";
import OpenAI from "openai";
import { recordAiCall, type AiContext, type AiOutcome } from "../telemetry.js";
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

export async function askPr(
  input: {
    title: string;
    body: string | null;
    files: GuideFile[];
    question: string;
    history: { role: "user" | "assistant"; content: string }[];
  },
  context: AiContext = {},
): Promise<string> {
  const started = performance.now();
  let outcome: AiOutcome = "failed";
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  let model = GUIDE_MODEL;
  try {
    client ??= new OpenAI();
    const provider = client;
    const res = await inSpan("ai.ask", () =>
      provider.responses.create({
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
      }),
    );
    usage = res.usage;
    model = res.model;
    outcome =
      res.status === "incomplete"
        ? "incomplete"
        : res.output.some(
              (o) =>
                o.type === "message" &&
                o.content.some((c) => c.type === "refusal"),
            )
          ? "refused"
          : res.output_text.trim()
            ? "ok"
            : "unparseable";
    return res.output_text.trim() || "I couldn't produce an answer for that.";
  } finally {
    await recordAiCall({
      ...context,
      operation: "ask",
      model,
      outcome,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      latencyMs: performance.now() - started,
    });
  }
}
