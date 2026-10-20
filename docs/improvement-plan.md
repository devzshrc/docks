# Improvement plan

Covers the 11 gaps from the October 2026 product review. Each item lists the goal, the changes, how we know it's done, and a size estimate (S ≈ 1–2 days, M ≈ 3–5 days, L ≈ 1–2 weeks).

Correction to the review: big PRs are already split into folder chunks (`generateGuide` → `chunkFiles` → `mergeGuides` in `packages/api/src/review/guide.ts`). The problem is the merge step, not a missing feature. See item 2.

## Phases

| Phase | Items | Why first |
|---|---|---|
| 0. Decide | 9, 10, 11 | Product calls that change what gets built. One meeting. |
| 1. Prove the core | 1, 2 | The walkthrough is the headline feature, and its quality is unknown. |
| 2. Safety net | 8 | Paid features (Billing, Deadlines) have no tests. Add them before refactoring anything. |
| 3. Feel fast | 5, 3 | Live updates and streaming answers. |
| 4. Fit every repo | 4 | Per-repo ranking rules. |
| 5. Scale and maintain | 6, 7 | Needed before large workspaces, not before. |

Phases 1 and 2 can run in parallel.

---

## Phase 0: Product decisions

### 9. Issues: core or cut back?
- **Recommendation:** freeze it. Keep what exists (list, board, creating follow-ups from reviews) and stop building new issue features. Issues stay as a link to PRs, not a separate tracker.
- **Output:** one line in `plan.md` §3 updating the goals and non-goals.

### 10. Personal inbox vs GitHub's PR Inbox
- **Recommendation:** keep the inbox, but make it about team ownership, which GitHub doesn't do: claimed reviews, deadlines, escalations and "stuck because of you". Drop anything that only copies GitHub notifications.
- **Output:** a short list of what to keep or drop from `/inbox`, then a small change to `personal-inbox.tsx`.

### 11. Leftovers
- **Checklist ticks synced to GitHub:** no. They stay private, as today. Record the decision in `plan.md` §14.
- **Reviewer suggestions from GitHub team membership:** push to after Phase 4. It needs the GitHub App's Members read permission, which makes installation ask for more access.

---

## Phase 1: Prove the walkthrough

### 1. Run the walkthrough eval with the real model (M)

**Goal:** a real quality number, and a launch decision based on it.

**Steps**
1. Hand-score 8–10 varied cases in `human-scores.csv` (follow `evals/guide/README.md`, "Before trusting the judge").
2. Run with the AI grader: `pnpm --filter @docks/api eval:guide --yes --judge-model <stronger model>`. The grader must be a different model from the one under test.
3. Compare the grader's scores with the hand scores. If they disagree by more than 1 point on several cases, fix the rubric in `judge.ts` and run again.
4. Run the model being tested at two reasoning efforts (`low`, `medium`) and one cheaper model, all with `--compare` against the first run. Record cost and speed for each.
5. Fix what fails. Likely fixes, all in `guide.ts`:
   - Step count out of range: enforce 3–6 in the Zod schema (`.min(3).max(6)`) and repair or retry once if the output breaks it.
   - Empty or generic checklists: add 2 short examples to `SYSTEM`, and require every question to name at least one file.
   - Make the fallback guide meet the step-count rule too (merge small folders, split large ones), since it's what users see when AI is off.
6. Save the passing run's `summary.json` under `evals/guide/results-baseline/` (committed) and set `OPENAI_GUIDE_MODEL` to the winner.

**Done when:** the run meets the launch bar in the README:
- every file covered in at least 90% of guides
- no invented file paths
- step count in range in at least 90% of guides
- grader averages of at least 4.0 on step grouping and summary accuracy, and at least 3.5 on checklist usefulness
- at least 7 of 10 spot-checked cases where a person would rather use this than GitHub's review page

**Keep it from regressing:** a CI job runs the free `--baseline` checks on every PR that touches `review/guide.ts` or `evals/`. The full AI run happens by hand before each model or prompt change.

**Collect real feedback (S, can ship now):** thumbs up/down on each step, each checklist question and the summary.
- Add a `guide_feedback` table: user, repo, PR, head SHA, item reference, vote.
- Add a `review.guideFeedback` mutation and buttons in `guide-panel.tsx` and `checklist.tsx`.
- Show the vote rate on the admin metrics page.

### 2. Better walkthroughs for large PRs (M)

**What's wrong today** (`mergeGuides`):
- The summary is chunk 1's summary plus a note, so it describes part of the PR.
- Steps from every chunk are joined end to end, so a 250-file PR can get 15+ steps, breaking the 3–6 rule.
- The checklist is cut to the first 10, so later chunks lose their questions.
- Chunks are generated one after another (slow), and each chunk can't see the others.
- Any single file's diff is cut at 12k characters.

**Changes**
1. **Map then reduce.** Generate the chunks in parallel (`Promise.all`, at most 3 at a time). Then make one more small "merge" call that takes the chunks' summaries, steps and checklists (not the diffs) and returns one guide that follows the schema: one summary, 3–8 steps (allow 8 for large PRs), and the best 7 checklist questions. Check every file path against the PR, as today. If the merge call fails, fall back to the current join-them-all behaviour.
2. **Shared context for every chunk.** Each chunk prompt also gets the full file list (names and tiers only) so it knows what's in the rest of the PR.
3. **Smarter cutting of large files.** Instead of a hard 12k cut, keep every hunk header and the first N lines of each hunk, so the model sees every place the file changed.
4. **Cost limit.** Skip the AI on PRs with more than 500 files or more than 400k characters of diff, and show the fallback guide with "Too large for a guided tour. Grouped by folder." Log the skip.
5. **Eval coverage.** Add 3 large PRs (150+ files) to `prs.json` and fetch them with `eval:guide:fetch`.

**Done when:** the large-PR cases pass the same checks as everything else (3–8 steps, checklist 3–7, coverage at least 90%), and p95 generation time on them is under 60 seconds.

---

## Phase 2: Tests for paid and untested features

### 8. Test coverage (L, can be split up)

Use what's already there: `tsx --test` for unit and integration tests (the `*.integration.test.ts` pattern with local Postgres), and Playwright in `apps/web/e2e`.

| Area | Unit / integration (packages/api) | Browser (apps/web/e2e) |
|---|---|---|
| **Billing** (`billing.ts`, Dodo webhook) | Webhook signature checks; subscription created/renewed/cancelled → workspace plan; repeated webhooks don't double-apply; downgrade blocks paid writes (`assertTeam`); free-plan limits (`assertCanAddMember`, `assertCanEnableRepo`) | Pricing → checkout redirect; billing page shows the plan |
| **Deadlines** (delivery router, cron) | Working-hours clock across timezones and weekends; draft PRs pause the clock; reminder at "remind before"; escalation to the lead; backup reviewer picked by the routing rules; Team plan checked when it runs | Owner enables a policy; the PR shows a deadline badge |
| **Releases** | Add or remove a PR; readiness expires after 15 minutes or a new head commit; the 100-PR limit; access is rechecked on refresh; evidence export CSV/JSON marks missing data | Create a release, add a PR, see blockers |
| **People / Teams** | Create, rename and delete teams; set members; only owners and admins can see reviewer response times | Filter people |
| **Knowledge** | Already covered for permissions and revisions. Add: archive/restore round trip; reusing an old revision | Already covered |
| **Slack digest** | Digest contents from fixture PRs; the digest hour respects timezone; test-digest endpoint; a disconnected Slack is skipped cleanly | (none) |
| **Linear** | Connect, choose a team, copy an issue, retry rules (mock the HTTP calls) | (none) |
| **Insights** | Router integration test on seeded data: filters by range, repo and team | Page renders charts with seeded data |

Mock GitHub, Slack, Linear, OpenAI and Dodo at the HTTP layer with recorded fixtures, as the guide eval does. No live calls in CI.

**Done when:** every row above has tests, CI runs them, and Billing and Deadlines block the deploy gate in `.github/workflows/deploy.yml`.

---

## Phase 3: Make it feel fast

### 5. Live updates instead of polling (L)

**Hosting facts:** the API runs on a Cloudflare Worker (`apps/server/src/worker.ts`). Webhooks queue jobs, and jobs drain right away via `waitUntil`. A plain Worker can't hold open connections across requests, so live updates need a **Durable Object**.

**Design**
1. **`WorkspaceHub` Durable Object**, one per workspace, using WebSocket hibernation so idle connections cost almost nothing.
   - `GET /live` opens the WebSocket. The Worker checks the Better Auth session and workspace membership, then hands the connection to the Durable Object.
2. **Publish events.** After any job or mutation that changes data the UI shows, send a small "something changed" event, never the data itself:
   - `sync_pr` → `{ t: "pr", repoId, number }`
   - inbox delivery → `{ t: "inbox", userId }`
   - release readiness → `{ t: "release", id }`
   - issue sync → `{ t: "issues", repoId }`
   - an Ask answer finishes → `{ t: "question", id }`
   - Add a `publish(workspaceId, event)` helper in `packages/api` that calls the Durable Object. In Node dev, it uses an in-process emitter plus a `ws` server.
   - The event never carries PR content, so access rules stay in tRPC: the client re-fetches through the normal permission-checked queries.
3. **Client.** A `useLive()` provider in `app-shell.tsx` keeps one socket open and maps each event to TanStack Query invalidations (for example, `pr` invalidates `review.board`, `review.get` for that PR, and `inbox.list`). Reconnect with backoff, and re-fetch everything once after reconnecting.
4. **Keep polling as a fallback.** Replace each fixed `refetchInterval` with `live.connected ? false : <current interval>`. Remove the 10-second polls (releases, the open Ask panel) once events cover them.
5. **Measure.** Log tRPC request counts per user per minute before and after.

**Done when:**
- a GitHub review shows on the board in under 3 seconds (webhook to screen)
- polling only runs while disconnected
- tRPC request volume from idle open tabs drops by more than 80%

### 3. A better Ask panel (M–L, three separate changes)

Today `review.ask` runs the whole AI call inside the tRPC request (`routers/review.ts` ~1492–1684).

**3a. Streaming answers (M)**
- Add a streaming endpoint (`GET /ask/:questionId/stream`, server-sent events from the Worker) that streams the OpenAI response, saves the final text, and marks the question `completed`.
- `review.ask` keeps saving the question and reserving quota, then returns the `questionId`. The client opens the stream.
- If the stream drops, the client falls back to re-fetching the saved answer.
- Citations are checked after the stream ends; invalid ones lose their links.

**3b. Fairer quota (S)**
- Count `completed` answers plus `pending` ones younger than 5 minutes. Don't count `failed`.
- To stop abuse, keep a separate hard limit of 60 total attempts per hour.
- A per-minute cron sweep marks `pending` questions older than 5 minutes as `failed`, which gives the quota back.
- Tests: a failed attempt gives quota back; a stuck pending attempt expires; the competing-requests lock still holds.

**3c. More context and deleted-line citations (M)**
- **Deleted lines:** let the model cite `path:-42` for old-side lines. Check them against the old side of the patches, and link to the base-commit permalink. Update `SYSTEM` and the citation parser in `ask-context.ts`.
- **Full changed files:** besides the diff, include the full head version of up to 5 changed files the question is about (the selected file first, then the biggest core files), capped at 40k characters total. Read through the existing `fileContent` path and cache by blob SHA.
- **One level of imports:** for the selected file, add the files it imports (JS/TS/Python/Go regexes), within the same budget.
- Still no embeddings or whole-repo search. Revisit only if eval answers show the context is missing.
- **Eval:** 20 question/answer cases on the existing fixtures, graded for "answered from evidence" and "citations valid".

**Done when:** the first words appear in under 2 seconds; failed attempts don't use quota; deleted-line citations link correctly; answer quality is at least as good on the Ask eval.

---

## Phase 4: Ranking that fits every repo

### 4. Per-repo ranking rules (M)

**Design:** an optional `.github/docks.yml` in the repo's default branch. Versioned and reviewed like code. Defaults apply when it's missing.

```yaml
tiers:
  core:   ["services/*/src/**"]
  config: ["infra/**"]
  test:   ["**/testdata/**"]
  noise:  ["**/*.pb.go", "web/public/**"]
collapse: ["**/fixtures/**"]
checklist:                       # extra questions when these paths change
  - paths: ["**/migrations/**"]
    question: "Does this migration handle existing rows and roll back cleanly?"
```

**Changes**
1. `tierOf(path, rules?)`: repo rules first, then the built-in defaults. Use `picomatch` for glob matching. `risk.ts` stays a pure function.
2. Load the file when a `push` to the default branch touches it (and once on install). Validate with Zod and store it in a `repository_rules` table (repo, sha, parsed JSON, error). If the file is invalid, keep the last good version and show the error in settings.
3. When the rules change, queue a job that recalculates `pr_file.tier` for open PRs.
4. Add the matching checklist questions to the guide after generation, marked "from repo rules".
5. In `settings/repositories`, show the rules currently in effect, the source commit, any error, and a "test a path" box. Read-only: edits happen in the repo.
6. Tests: matching order, invalid YAML, recalculation job, checklist injection.

**Done when:** a monorepo fixture ranks correctly with a 5-line config, and a broken config never breaks a review.

---

## Phase 5: Scale and maintainability

### 6. Insights in SQL (S–M)
- Rewrite `routers/insights.ts` to compute in Postgres: `percentile_cont(0.5) WITHIN GROUP (...)` for medians, `date_trunc('week', ...)` for weekly trends, grouped by repo and reviewer.
- Add indexes as `EXPLAIN` shows they're needed. Likely candidates: `pull_request (repo_id, merged_at)`, `pull_request (repo_id, gh_created_at)`, `pr_review (repo_id, submitted_at)`.
- Keep the current in-memory functions in `insights.ts` as a test reference: a test seeds data and checks that SQL and JS give the same numbers.
- Cache results in KV for 5 minutes, keyed by workspace, filters and the latest sync time.
- **Done when:** p95 under 300 ms on a seeded workspace with 50k PRs.

### 7. Split the large files (M, alongside other work)

Split behind the tests from Phase 2. Change one file per PR, with no behaviour changes.

| File | Split into |
|---|---|
| `routers/review.ts` (1,684) | `review/board`, `review/guide`, `review/actions` (submit, merge, auto-merge), `review/threads`, `review/ask`, `review/session`, merged in one `reviewRouter` |
| `file-diff.tsx` (1,399) | `diff-parse.ts` (pure, unit-tested), `diff-row.tsx`, `diff-hunk.tsx`, `diff-gutter.tsx` (blame, viewed state, risk marks), `file-diff.tsx` (container) |
| `guided-review.tsx` (997) | layout shell, plus `use-review-state.ts` (viewed state, session, keyboard shortcuts), plus the existing side panels |
| `admin-dashboard.tsx` (1,530) | one file per tab: overview, users, workspaces, health, usage |
| `settings/workspace/page.tsx` (996) | general, members, invites, danger-zone sections |
| `new-issue/panel.tsx` (971) | form state hook, pickers, duplicate-check panel |

**Done when:** no file in these areas is over about 500 lines, and all tests and e2e still pass.

---

## Tracking

- One GitHub milestone per phase. One PR per item (or sub-item, such as 3a/3b/3c).
- Database migrations stay additive and go through the existing migration gate before deploy (see `docs/DEPLOY.md`).
- After each phase, re-check the "Done when" numbers and note them here.
