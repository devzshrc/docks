import type { GuideFile } from "../../src/review/guide.js";
import type { Guide } from "../../src/review/types.js";

export interface EvalPr {
  id: string;
  repo: string;
  number: number;
  title: string;
  kind: string;
  files: number;
  lines: number;
}

export interface EvalFixture {
  id: string;
  repo: string;
  number: number;
  url: string;
  headSha: string;
  title: string;
  body: string | null;
  /** Raw from GitHub. Tiers are computed at run time so rule fixes apply. */
  files: (Omit<GuideFile, "tier" | "patch"> & { status: string; patch: string | null })[];
}

/** Deterministic checks; no model involved. */
export interface Checks {
  stepCount: number;
  stepCountOk: boolean;
  /** Share of non-generated files placed in at least one step (0–1). */
  coverage: number;
  /** Files placed in more than one step. */
  duplicateFiles: number;
  /** Lockfiles / generated files placed in a step. */
  noiseInSteps: number;
  checklistCount: number;
  checklistCountOk: boolean;
  /** Share of checklist questions linked to at least one file (0–1). */
  checklistLinked: number;
  /** Paths the model referenced that aren't in the PR. */
  invalidPaths: number;
}

/** 1–5 per criterion, from the judge model. */
export interface JudgeScores {
  stepOrder: number;
  stepGrouping: number;
  summaryAccuracy: number;
  checklistSpecificity: number;
  checklistUsefulness: number;
  genericQuestions: string[];
  notes: string;
}

export interface CaseResult {
  id: string;
  url: string;
  ok: boolean;
  error?: string;
  guide?: Guide;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  checks?: Checks;
  judge?: JudgeScores;
  judgeError?: string;
}
