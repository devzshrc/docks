/**
 * Review-guide eval (plan.md §14.2). Runs the guide over 30 frozen PRs, applies
 * deterministic checks, optionally grades with a judge model, and writes a
 * report you can compare across models and prompt changes.
 *
 *   pnpm --filter @docks/api eval:guide --baseline            # no-AI fallback, free
 *   pnpm --filter @docks/api eval:guide                       # prints estimate, stops
 *   pnpm --filter @docks/api eval:guide --yes                 # guide + judge (spends tokens)
 *   pnpm --filter @docks/api eval:guide --yes --model gpt-6-luna --no-judge
 *   pnpm --filter @docks/api eval:guide --yes --compare results/<earlier-run>
 *
 * Flags: --model, --effort (minimal|low|medium|high), --judge-model, --no-judge,
 *        --only id1,id2, --limit N, --concurrency N (default 4), --label name
 * Env:   OPENAI_API_KEY (paid runs), OPENAI_GUIDE_MODEL, OPENAI_JUDGE_MODEL
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  generateGuide,
  fallbackGuide,
  GUIDE_MODEL,
  renderDiff,
  type GuideFile,
  type GuideOptions,
} from "../../src/review/guide.js";
import { tierOf } from "../../src/review/risk.js";
import { runChecks } from "./checks.js";
import { judgeGuide } from "./judge.js";
import type { CaseResult, EvalFixture } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

const { values: args } = parseArgs({
  options: {
    model: { type: "string" },
    effort: { type: "string" },
    "judge-model": { type: "string" },
    "no-judge": { type: "boolean", default: false },
    baseline: { type: "boolean", default: false },
    only: { type: "string" },
    limit: { type: "string" },
    concurrency: { type: "string", default: "4" },
    label: { type: "string" },
    compare: { type: "string" },
    yes: { type: "boolean", default: false },
    // Exit non-zero if the structural checks miss the launch bar (CI runs this on the free baseline).
    check: { type: "boolean", default: false },
  },
});

const model = args.model ?? GUIDE_MODEL;
const effort = (args.effort ?? "low") as GuideOptions["effort"];
const judgeModel = args["judge-model"] ?? process.env.OPENAI_JUDGE_MODEL ?? model;
const useJudge = !args.baseline && !args["no-judge"];

// ---- load fixtures ---------------------------------------------------------

let fixtures = readdirSync(join(here, "fixtures"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(here, "fixtures", f), "utf8")) as EvalFixture);
if (args.only) {
  const ids = new Set(args.only.split(","));
  fixtures = fixtures.filter((f) => ids.has(f.id));
}
if (args.limit) fixtures = fixtures.slice(0, Number(args.limit));
if (!fixtures.length) {
  console.error("No fixtures. Run eval:guide:fetch first.");
  process.exit(1);
}

const filesOf = (fx: EvalFixture): GuideFile[] =>
  fx.files.map((f) => ({ ...f, tier: tierOf(f.filename) }));

// ---- cost gate ---------------------------------------------------------------

if (!args.baseline) {
  // ~4 characters per token; the judge reads the diff again plus the guide.
  const chars = fixtures.reduce((n, fx) => n + renderDiff(filesOf(fx)).length + (fx.body?.length ?? 0), 0);
  const perPass = Math.round(chars / 4);
  const estimate = perPass * (useJudge ? 2 : 1);
  console.log(
    `${fixtures.length} cases · guide ${model} (effort ${effort})${useJudge ? ` · judge ${judgeModel}` : ""}\n` +
      `≈${estimate.toLocaleString()} input tokens plus reasoning and output tokens.`,
  );
  if (useJudge && judgeModel === model) {
    console.log("Note: the judge is the model under test. Pass --judge-model to use a different one.");
  }
  if (!args.yes) {
    console.log("This calls the OpenAI API and costs money. Re-run with --yes to proceed.");
    process.exit(0);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set.");
    process.exit(1);
  }
}

// ---- run --------------------------------------------------------------------

const label = args.label ?? (args.baseline ? "baseline" : `${model}-${effort}`);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(here, "results", `${stamp}-${label}`);
mkdirSync(join(outDir, "cases"), { recursive: true });

let judgeTokens = { input: 0, output: 0 };

async function runCase(fx: EvalFixture): Promise<CaseResult> {
  const files = filesOf(fx);
  const result: CaseResult = { id: fx.id, url: fx.url, ok: false };
  const started = Date.now();
  try {
    if (args.baseline) {
      result.guide = fallbackGuide(files, "baseline");
      result.model = "fallback";
      result.checks = runChecks(result.guide, files, []);
    } else {
      const g = await generateGuide({ title: fx.title, body: fx.body, files }, { model, effort });
      if (!g) throw new Error("too large for an AI guide");
      Object.assign(result, {
        guide: g.guide,
        model: g.model,
        inputTokens: g.inputTokens,
        outputTokens: g.outputTokens,
        checks: runChecks(g.guide, files, g.invalidPaths),
      });
    }
    result.latencyMs = Date.now() - started;
    result.ok = true;
  } catch (err) {
    result.error = (err as Error).message;
    result.latencyMs = Date.now() - started;
  }

  if (result.ok && useJudge && result.guide) {
    try {
      const j = await judgeGuide(fx, files, result.guide, judgeModel);
      result.judge = j.scores;
      judgeTokens = { input: judgeTokens.input + j.inputTokens, output: judgeTokens.output + j.outputTokens };
    } catch (err) {
      result.judgeError = (err as Error).message;
    }
  }

  writeFileSync(join(outDir, "cases", `${fx.id}.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${result.ok ? "✓" : "✗"} ${fx.id}${result.error ? ` — ${result.error}` : ""}`);
  return result;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

const results = await pool(fixtures, Number(args.concurrency), runCase);

// ---- summarise ------------------------------------------------------------------

const ok = results.filter((r) => r.ok && r.checks);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (xs: boolean[]) => mean(xs.map((x) => (x ? 1 : 0)));
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : NaN;
};
const judged = ok.filter((r) => r.judge);
const judgeMean = (k: keyof Omit<NonNullable<CaseResult["judge"]>, "genericQuestions" | "notes">) =>
  mean(judged.map((r) => r.judge![k]));

const summary = {
  label,
  model: args.baseline ? "fallback" : model,
  effort: args.baseline ? null : effort,
  judgeModel: useJudge ? judgeModel : null,
  cases: results.length,
  succeeded: ok.length,
  checks: {
    stepCountOk: pct(ok.map((r) => r.checks!.stepCountOk)),
    coverage: mean(ok.map((r) => r.checks!.coverage)),
    fullCoverage: pct(ok.map((r) => r.checks!.coverage === 1)),
    duplicateFiles: ok.reduce((n, r) => n + r.checks!.duplicateFiles, 0),
    noiseInSteps: ok.reduce((n, r) => n + r.checks!.noiseInSteps, 0),
    checklistCountOk: pct(ok.map((r) => r.checks!.checklistCountOk)),
    checklistLinked: mean(ok.map((r) => r.checks!.checklistLinked)),
    invalidPaths: ok.reduce((n, r) => n + r.checks!.invalidPaths, 0),
  },
  judge: judged.length
    ? {
        graded: judged.length,
        stepOrder: judgeMean("stepOrder"),
        stepGrouping: judgeMean("stepGrouping"),
        summaryAccuracy: judgeMean("summaryAccuracy"),
        checklistSpecificity: judgeMean("checklistSpecificity"),
        checklistUsefulness: judgeMean("checklistUsefulness"),
        genericQuestions: judged.reduce((n, r) => n + r.judge!.genericQuestions.length, 0),
      }
    : null,
  tokens: {
    guideInput: ok.reduce((n, r) => n + (r.inputTokens ?? 0), 0),
    guideOutput: ok.reduce((n, r) => n + (r.outputTokens ?? 0), 0),
    judgeInput: judgeTokens.input,
    judgeOutput: judgeTokens.output,
  },
  latencyMs: { p50: quantile(ok.map((r) => r.latencyMs ?? 0), 0.5), p95: quantile(ok.map((r) => r.latencyMs ?? 0), 0.95) },
};
writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

// ---- report -----------------------------------------------------------------------

type Summary = typeof summary;
let previous: Summary | null = null;
if (args.compare) {
  try {
    previous = JSON.parse(readFileSync(join(resolve(here, args.compare), "summary.json"), "utf8"));
  } catch {
    console.error(`Couldn't read ${args.compare}/summary.json; skipping comparison.`);
  }
}

const fmt = (n: number | null | undefined, kind: "pct" | "num" | "int" = "num") =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : kind === "pct"
      ? `${Math.round(n * 100)}%`
      : kind === "int"
        ? String(Math.round(n))
        : n.toFixed(2);
const row = (name: string, now: number | null | undefined, before: number | null | undefined, kind: "pct" | "num" | "int") =>
  `| ${name} | ${fmt(now, kind)} |${previous ? ` ${fmt(before, kind)} |` : ""}`;

const head = previous ? `| Metric | This run | ${previous.label} |\n|---|---|---|` : "| Metric | Value |\n|---|---|";
const lines = [
  `# Guide eval: ${label}`,
  "",
  `Guide model: ${summary.model}${summary.effort ? ` (effort ${summary.effort})` : ""} · Judge: ${summary.judgeModel ?? "none"} · ${summary.succeeded}/${summary.cases} cases succeeded`,
  "",
  "## Checks (deterministic)",
  "",
  head,
  row("Step count in range", summary.checks.stepCountOk, previous?.checks.stepCountOk, "pct"),
  row("Mean file coverage", summary.checks.coverage, previous?.checks.coverage, "pct"),
  row("Guides covering every file", summary.checks.fullCoverage, previous?.checks.fullCoverage, "pct"),
  row("Files placed in 2+ steps", summary.checks.duplicateFiles, previous?.checks.duplicateFiles, "int"),
  row("Lockfiles/generated in steps", summary.checks.noiseInSteps, previous?.checks.noiseInSteps, "int"),
  row("Checklist size 3–7", summary.checks.checklistCountOk, previous?.checks.checklistCountOk, "pct"),
  row("Checklist questions linked to files", summary.checks.checklistLinked, previous?.checks.checklistLinked, "pct"),
  row("Invented file paths", summary.checks.invalidPaths, previous?.checks.invalidPaths, "int"),
  "",
];
if (summary.judge) {
  lines.push(
    `## Judge (1–5, ${summary.judge.graded} graded)`,
    "",
    head,
    row("Step order", summary.judge.stepOrder, previous?.judge?.stepOrder, "num"),
    row("Step grouping", summary.judge.stepGrouping, previous?.judge?.stepGrouping, "num"),
    row("Summary accuracy", summary.judge.summaryAccuracy, previous?.judge?.summaryAccuracy, "num"),
    row("Checklist specificity", summary.judge.checklistSpecificity, previous?.judge?.checklistSpecificity, "num"),
    row("Checklist usefulness", summary.judge.checklistUsefulness, previous?.judge?.checklistUsefulness, "num"),
    row("Generic questions (total)", summary.judge.genericQuestions, previous?.judge?.genericQuestions, "int"),
    "",
  );
}
lines.push(
  "## Cost and speed",
  "",
  `Guide tokens: ${summary.tokens.guideInput.toLocaleString()} in / ${summary.tokens.guideOutput.toLocaleString()} out · ` +
    `Judge tokens: ${summary.tokens.judgeInput.toLocaleString()} in / ${summary.tokens.judgeOutput.toLocaleString()} out · ` +
    `Latency p50 ${fmt(summary.latencyMs.p50 / 1000)}s, p95 ${fmt(summary.latencyMs.p95 / 1000)}s`,
  "",
  "## Cases",
  "",
  "| Case | Steps | Coverage | Checklist | Invented | Judge (order/group/summary/spec/useful) | Note |",
  "|---|---|---|---|---|---|---|",
  ...results.map((r) => {
    const c = r.checks;
    const j = r.judge;
    const note = r.error ?? r.judgeError ?? (j && j.notes !== "none" ? j.notes : "");
    return `| [${r.id}](${r.url}) | ${c ? `${c.stepCount}${c.stepCountOk ? "" : " ⚠"}` : "—"} | ${c ? fmt(c.coverage, "pct") : "—"} | ${c ? `${c.checklistCount}${c.checklistCountOk ? "" : " ⚠"}` : "—"} | ${c?.invalidPaths ?? "—"} | ${j ? `${j.stepOrder}/${j.stepGrouping}/${j.summaryAccuracy}/${j.checklistSpecificity}/${j.checklistUsefulness}` : "—"} | ${note.replace(/\|/g, "\\|").replace(/\n/g, " ")} |`;
  }),
  "",
  "## Guides",
  "",
  ...ok.flatMap((r) => [
    `### ${r.id}`,
    "",
    r.guide!.summary,
    "",
    ...r.guide!.steps.map((s, i) => `${i + 1}. **${s.title}**${s.why ? ` — ${s.why}` : ""}  \n   ${s.files.map((f) => `\`${f}\``).join(", ")}`),
    "",
    ...(r.guide!.checklist.length ? ["Checklist:", ...r.guide!.checklist.map((c) => `- ${c.question}`), ""] : []),
  ]),
);
writeFileSync(join(outDir, "report.md"), `${lines.join("\n")}\n`);

// Human spot-check sheet: score a sample by hand, then compare with the judge.
writeFileSync(
  join(outDir, "human-scores.csv"),
  [
    "id,url,tour_useful_1to5,checklist_useful_1to5,would_use_instead_of_github_yes_no,notes",
    ...ok.map((r) => `${r.id},${r.url},,,,`),
  ].join("\n") + "\n",
);

console.log(`\nReport: ${join(outDir, "report.md")}`);

if (args.check) {
  const c = summary.checks;
  const failures = [
    ok.length < results.length && `${results.length - ok.length} case(s) failed to run`,
    c.fullCoverage < 0.9 && `only ${Math.round(c.fullCoverage * 100)}% of guides cover every file (bar: 90%)`,
    c.invalidPaths > 0 && `${c.invalidPaths} invented file path(s)`,
    c.duplicateFiles > 0 && `${c.duplicateFiles} file(s) placed in more than one step`,
    c.noiseInSteps > 0 && `${c.noiseInSteps} lockfile/generated file(s) in steps`,
    // AI runs must also meet the step and checklist bars; the fallback has no checklist by design.
    !args.baseline && c.stepCountOk < 0.9 && `step count in range for only ${Math.round(c.stepCountOk * 100)}% (bar: 90%)`,
  ].filter(Boolean);
  if (failures.length) {
    console.error(`\nEval check failed:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("Eval check passed.");
}
