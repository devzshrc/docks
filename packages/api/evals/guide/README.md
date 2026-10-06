# Review-guide eval

Measures the AI review guide (plan.md §6.3, §14.2) on 30 frozen, merged public PRs
from 12 repos (TypeScript, Python, Go; features, fixes, refactors, dependency bumps).

| File | What it is |
|---|---|
| `prs.json` | The 30 PRs and why each is there (kind, size) |
| `fixtures/` | Title, description and diff per PR, as fetched. Tiers are recomputed at run time |
| `checks.ts` | Deterministic checks: step count, file coverage, duplicates, lockfiles in steps, checklist size and links, invented paths |
| `judge.ts` | Model-graded rubric (1–5): step order, grouping, summary accuracy, checklist specificity and usefulness |
| `run.ts` | Runs everything and writes `results/<time>-<label>/` (gitignored) |

## Run

```bash
pnpm --filter @docks/api eval:guide --baseline     # no-AI fallback; free; the floor to beat
pnpm --filter @docks/api eval:guide                # prints a token estimate and stops
pnpm --filter @docks/api eval:guide --yes --judge-model <stronger-model>
pnpm --filter @docks/api eval:guide --yes --model <other> --compare results/<earlier-run>
```

Each run writes `summary.json`, `report.md` (metrics, per-case table, every guide) and
`human-scores.csv`.

## Before trusting the judge

1. Score 8–10 cases by hand in `human-scores.csv` (pick a spread, not the first ten).
2. Compare with the judge's scores for the same cases. If they disagree by more than
   one point on several cases, fix the rubric in `judge.ts` before using judge numbers
   to pick a model.
3. Use a judge model different from the model under test where you can.

## Bar for launch (proposal)

- Every file covered in ≥ 90% of guides; zero invented paths; step count in range ≥ 90%
- Judge means ≥ 4.0 on step grouping and summary accuracy, ≥ 3.5 on checklist usefulness
- Human "would use instead of GitHub" yes on ≥ 7 of 10 spot-checked cases

## Refreshing fixtures

`pnpm --filter @docks/api eval:guide:fetch` fetches missing fixtures with `gh`.
Changing the PR list changes the benchmark: keep old results only for comparison
within the same set.
