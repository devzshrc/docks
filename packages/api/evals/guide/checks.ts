import type { GuideFile } from "../../src/review/guide.js";
import type { Guide } from "../../src/review/types.js";
import type { Checks } from "./types.js";

/**
 * Deterministic checks against the prompt's own contract (plan.md §6.3):
 * 3–6 steps, every non-generated file in exactly one step, 3–7 checklist
 * questions tied to files, no invented paths.
 */
export function runChecks(guide: Guide, files: GuideFile[], invalidPaths: string[]): Checks {
  const reviewable = files.filter((f) => f.tier !== "noise").map((f) => f.filename);
  const noise = new Set(files.filter((f) => f.tier === "noise").map((f) => f.filename));

  const placements = new Map<string, number>();
  for (const step of guide.steps) {
    for (const f of step.files) placements.set(f, (placements.get(f) ?? 0) + 1);
  }

  // Tiny PRs can't fill 3 steps; don't penalise 1–2 steps when there are 1–2 files.
  const minSteps = Math.min(3, Math.max(1, reviewable.length));
  const stepCount = guide.steps.length;
  const checklistCount = guide.checklist.length;

  return {
    stepCount,
    stepCountOk: stepCount >= minSteps && stepCount <= 6,
    coverage: reviewable.length
      ? reviewable.filter((f) => placements.has(f)).length / reviewable.length
      : 1,
    duplicateFiles: [...placements.values()].filter((n) => n > 1).length,
    noiseInSteps: [...placements.keys()].filter((f) => noise.has(f)).length,
    checklistCount,
    checklistCountOk: checklistCount >= 3 && checklistCount <= 7,
    checklistLinked: checklistCount
      ? guide.checklist.filter((c) => c.files.length > 0).length / checklistCount
      : 0,
    invalidPaths: invalidPaths.length,
  };
}
