# Technical PRD: Guided Code Review (v1 MVP)

## 1. Summary

A review cockpit for GitHub pull requests. It does not post AI comments on PRs; it makes the human reviewer faster.

- **Team review board:** every open PR in a column by review state, with stuck PRs highlighted.
- **Guided review view:** files ordered by risk, an AI "tour" of the change in 3–6 steps, a checklist of questions only a human can answer, and per-file progress that survives new pushes.
- **One-click actions:** approve, request changes, comment and merge, written back to GitHub.

It sits next to AI bot reviewers (CodeRabbit, Copilot review), not against them.

## 2. Problem

- AI coding tools mean more PRs and bigger PRs; review is now the bottleneck.
- GitHub's review UI treats every file the same, loses your place between visits, and buries review requests in notifications.
- Team review requests sit unclaimed because nobody owns them.
- AI review bots add more comments to read, not less work.

## 3. Goals and non-goals

**v1 goals**
1. A reviewer finishes a medium PR (5–20 files) noticeably faster than on GitHub. Target: 30% less time in a side-by-side test.
2. A team can see in under 5 seconds which PRs are stuck and on whom.
3. Every action taken in the app is reflected in GitHub immediately.

**Non-goals (v1)**
- Posting automated review comments on PRs.
- Stacked PRs, merge queues.
- GitLab, Bitbucket, Azure DevOps.
- IDE plugins.
- Analytics dashboards (cycle time, per-person metrics).
- Issue tracking or sprint planning.

## 4. Personas

| Persona | Need |
|---|---|
| Reviewer (IC engineer) | "Show me what matters in this PR and let me get through it fast." |
| Author | "Get my PR reviewed today without chasing people." |
| Tech lead / EM | "What's stuck, and who is overloaded?" |

Target customer: engineering teams of 5–50 on GitHub.

## 5. User flows

### 5.1 Onboarding
1. User signs up (Better Auth, email + password; GitHub OAuth in v1.1).
2. User installs the GitHub App on their org and picks repositories.
3. Backfill job pulls open PRs, reviews, files and checks into Postgres.
4. User lands on the review board for their first repository.

**Prototype shortcut:** a server-side `GITHUB_TOKEN` personal access token instead of the GitHub App. Replace before any external user.

### 5.2 Team board
1. User opens **Reviews**, picks a repository (remembered per browser).
2. Board shows four columns: Needs reviewer → Waiting on review → Changes requested → Approved. Drafts are hidden.
3. Each card: number, title, author, age, requested reviewers, size, CI status. Stuck cards have an amber border and a "stuck" badge.
4. A banner counts stuck PRs: "3 PRs waiting more than 24h".
5. Clicking a card opens the guided review view.

### 5.3 Guided review
1. Header: title, branch → base, diff stats, CI checks, reviewer states, link to GitHub.
2. **Summary and tour** (left rail): 2–3 sentence summary, then numbered steps ("1. Schema change", "2. API endpoint", "3. UI wiring"). Clicking a step filters the diff to its files.
3. **Diff** (main): files ordered core → config → tests → noise. Lockfiles and generated files collapsed by default.
4. Each file has a **Viewed** checkbox. Progress bar shows "4 of 9 files reviewed".
5. If the author pushes again, files whose content changed show **Changed since you viewed** and lose their viewed state; untouched files keep it.
6. **Checklist** (right rail): questions like "Does the migration handle existing rows?" each linked to files. Reviewer ticks them off locally; they are prompts, not comments.
7. **Actions** (sticky footer): Approve, Request changes, Comment (with a text box), Merge (squash default). Result reflected on GitHub and on the board.

### 5.4 Nudges (v1, last week)
1. Daily Slack message per team channel at a set hour: stuck PRs and who they are waiting on.
2. Clicking a PR in Slack deep-links to the guided view.

## 6. Functional requirements

| ID | Requirement |
|---|---|
| F1 | GitHub App installation, repository selection, webhook ingestion |
| F2 | Board with four review-state columns, stuck detection, filters (author, reviewer, "waiting on me") |
| F3 | Deterministic risk ranking of files (core, config, test, noise) |
| F4 | AI review guide: summary, 3–6 steps, 3–7 checklist questions; cached per head commit |
| F5 | Fallback guide (group by folder, no checklist) when AI fails or is disabled |
| F6 | Per-user, per-file viewed state keyed by file blob SHA |
| F7 | Review actions: approve, request changes, comment, merge |
| F8 | Daily Slack digest of stuck PRs |
| F9 | Workspace with members; billing per seat (Dodo Payments) |

### 6.1 Review-state rules
Computed from GitHub data, never set manually.

| Column | Rule |
|---|---|
| Changes requested | Any reviewer's latest verdict is `CHANGES_REQUESTED` |
| Approved | Otherwise, any reviewer's latest verdict is `APPROVED` |
| Needs reviewer | No verdicts and no requested reviewers |
| Waiting on review | No verdicts, at least one requested reviewer |

Plain `COMMENTED` reviews don't change the column. Draft PRs are excluded.

**Stuck:** in Needs reviewer or Waiting on review, and no activity for more than 24h (threshold configurable per workspace later).

### 6.2 Risk tiers
| Tier | Examples | Default display |
|---|---|---|
| core | `src/**` application code | expanded, first |
| config | `package.json`, `tsconfig*.json`, `*.yml`, `.github/**`, Dockerfile | expanded |
| test | `*.test.ts`, `*.spec.ts`, `__tests__/**`, `e2e/**` | expanded, after core |
| noise | lockfiles, `dist/`, `generated/`, `*.snap`, `*.map`, images, `drizzle/meta/**` | collapsed, last |

Within a tier, larger changes first. Rules live in code; per-repo overrides via a config file later.

### 6.3 AI guide
- **Input:** PR title, body, and the ranked diff. Noise files are listed by name only. Each file patch is capped at 12,000 characters with an explicit `[patch truncated]` marker.
- **Output (structured JSON, schema-validated):**
  ```ts
  {
    summary: string;
    steps: { title: string; why: string; files: string[] }[];     // 3–6
    checklist: { question: string; files: string[] }[];           // 3–7
  }
  ```
- **Model:** OpenAI `gpt-6-astra` (override with `OPENAI_GUIDE_MODEL`) at reasoning effort `low`, structured outputs via `responses.parse` + `zodTextFormat`. Re-evaluate model and effort against an eval set before launch.
- **Caching:** one guide per `(repo, pr_number, head_sha)`. A new push generates a new guide; old ones are kept.
- **Generation trigger:** on `pull_request.opened` / `synchronize` webhook (async job), and lazily on first view if missing.
- **Validation:** drop any file path in the output that isn't in the PR.
- **Failure:** refusal, parse failure or API error → fallback guide, not cached, retried on next view.
- **Privacy:** code is sent to the OpenAI API only for repositories where the workspace has AI enabled (on by default, toggle in settings). No code is used for training.

## 7. Architecture

Fits the existing monorepo:

```
apps/web        Next.js 15 – board and guided review UI
apps/server     Express – tRPC, Better Auth, GitHub webhooks, jobs
packages/api    tRPC routers + review domain (github client, risk, guide)
packages/db     Drizzle schema + migrations (Postgres)
```

```
GitHub ──webhooks──▶ apps/server /webhooks/github ──▶ jobs table ──▶ worker
   ▲                                                         │
   │ REST (installation token)                               ├─ sync PR mirror (pull, files, reviews, checks)
   │                                                         └─ generate AI guide (OpenAI API)  
apps/web ──tRPC──▶ apps/server ──▶ packages/api routers ──▶ Postgres mirror
```

- **Reads** come from the Postgres mirror, so the board loads in one query instead of N GitHub calls.
- **Writes** (review, merge) go straight to GitHub; the mirror updates from the resulting webhook, with an optimistic update in the UI.
- **Jobs:** a row-level `jobs` table polled by a worker in `apps/server` (`SELECT … FOR UPDATE SKIP LOCKED`). Move to a real queue when volume needs it.
- **Prototype mode:** no mirror; routers call GitHub directly with `GITHUB_TOKEN`. Fine for one team, hits rate limits beyond that.

## 8. Data model (Drizzle / Postgres)

Existing: `user`, `session`, `account`, `verification` (Better Auth).

```
workspace            id, name, slug, created_at, updated_at
workspace_member     workspace_id, user_id, role (owner|member), created_at
                     PK (workspace_id, user_id)

github_installation  id (GitHub installation id), workspace_id, account_login,
                     account_type (Organization|User), suspended_at, created_at

repository           id (GitHub repo id), installation_id, full_name ("owner/name"),
                     default_branch, enabled, ai_enabled, created_at

pull_request         repo_id, number, title, body, author_login, state (open|closed|merged),
                     draft, head_ref, head_sha, base_ref, additions, deletions, changed_files,
                     requested_reviewers text[], review_column, stuck,
                     last_activity_at, created_at, updated_at
                     PK (repo_id, number)

pr_review            id (GitHub review id), repo_id, pr_number, reviewer_login,
                     state, submitted_at

pr_file              repo_id, pr_number, head_sha, path, blob_sha, status,
                     additions, deletions, tier
                     PK (repo_id, pr_number, head_sha, path)

pr_check             repo_id, head_sha, name, status, conclusion, updated_at

review_guide         repo, pr_number, head_sha, model, guide jsonb, created_at, updated_at
                     PK (repo, pr_number, head_sha)

review_progress      user_id, repo, pr_number, path, file_sha, created_at, updated_at
                     PK (user_id, repo, pr_number, path)

github_identity      user_id, github_login, github_user_id   -- maps app users to GitHub users

jobs                 id, type (sync_pr|generate_guide|slack_digest), payload jsonb,
                     status (queued|running|done|failed), attempts, run_after, last_error

slack_integration    workspace_id, team_id, channel_id, bot_token (encrypted), digest_hour
```

Indexes: `pull_request (repo_id, review_column)`, `pull_request (repo_id, stuck)`, `pr_review (repo_id, pr_number)`, `jobs (status, run_after)`.

## 9. API

### 9.1 tRPC routers (`packages/api`)

All procedures are `protectedProcedure` and check that the caller belongs to the workspace that owns the repository.

**`workspace`**
| Procedure | Type | Input | Output |
|---|---|---|---|
| `workspace.list` | query | – | workspaces for current user |
| `workspace.create` | mutation | `{ name }` | workspace |
| `workspace.repos` | query | `{ workspaceId }` | repositories with `enabled`, `aiEnabled` |
| `workspace.setRepo` | mutation | `{ repoId, enabled?, aiEnabled? }` | repository |

**`review`**
| Procedure | Type | Input | Output |
|---|---|---|---|
| `review.board` | query | `{ repo, filter?: "mine" \| "waiting_on_me" }` | `BoardCard[]` |
| `review.get` | query | `{ repo, number }` | `{ pr, files: RankedFile[], reviews, checks }` |
| `review.guide` | query | `{ repo, number }` | `Guide` (`source: "ai" \| "fallback"`) |
| `review.markViewed` | mutation | `{ repo, number, path, fileSha, viewed }` | void |
| `review.submit` | mutation | `{ repo, number, event: APPROVE \| REQUEST_CHANGES \| COMMENT, body }` | review |
| `review.merge` | mutation | `{ repo, number, method: merge \| squash \| rebase }` | `{ merged }` |
| `review.regenerateGuide` | mutation | `{ repo, number }` | `Guide` (rate-limited, 1/min per PR) |

```ts
type BoardCard = {
  number: number; title: string; url: string;
  author: { login: string; avatar_url: string };
  reviewers: { login: string; avatar_url: string }[];
  column: "needs_reviewer" | "waiting" | "changes_requested" | "approved";
  stuck: boolean; updatedAt: string;
  additions: number; deletions: number; ci: "pass" | "fail" | "pending" | "none";
};

type RankedFile = {
  filename: string; sha: string; status: string; patch?: string;
  additions: number; deletions: number;
  tier: "core" | "config" | "test" | "noise";
  viewed: boolean; changedSinceViewed: boolean;
};
```

**`integration`**
| Procedure | Type | Input | Output |
|---|---|---|---|
| `integration.githubInstallUrl` | query | `{ workspaceId }` | URL to install the GitHub App |
| `integration.slackConnectUrl` | query | `{ workspaceId }` | Slack OAuth URL |
| `integration.setDigest` | mutation | `{ workspaceId, channelId, hour }` | integration |

**`billing`** (last): `billing.checkoutUrl`, `billing.portalUrl`, `billing.status`.

### 9.2 HTTP endpoints (`apps/server`)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/webhooks/github` | GitHub App events; verify `X-Hub-Signature-256`, enqueue jobs, return 202 |
| `GET` | `/integrations/github/callback` | Post-install redirect; link installation to workspace |
| `GET` | `/integrations/slack/callback` | Slack OAuth callback |
| `POST` | `/webhooks/dodo-payments` | Dodo Payments subscription events (Standard Webhooks signature) |
| `ALL` | `/api/auth/*` | Better Auth (existing) |
| `ALL` | `/trpc/*` | tRPC (existing) |

**GitHub events handled:** `installation`, `installation_repositories`, `pull_request` (opened, synchronize, reopened, closed, ready_for_review, review_requested, review_request_removed), `pull_request_review` (submitted, dismissed), `check_run`, `check_suite`.

**GitHub App permissions:** Pull requests read/write, Contents read, Checks read, Metadata read. Members read (for reviewer suggestions in v1.1).

### 9.3 Web routes (`apps/web`)

| Route | Screen |
|---|---|
| `/review` | Board (repo picker, four columns, stuck banner) |
| `/review/[owner]/[repo]/[number]` | Guided review view |
| `/settings/integrations` | GitHub App, Slack |
| `/settings/repositories` | Enable repos, AI toggle |
| `/settings/billing` | Plan and seats |

## 10. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Board p95 < 500 ms from mirror; guided view first paint < 1 s; guide ready within 30 s of a push |
| Freshness | Board reflects GitHub changes within 10 s of the webhook |
| Rate limits | All GitHub calls via installation tokens; back off on `403`/`429` using `x-ratelimit-reset` |
| Security | Webhook signature verification; installation tokens never sent to the browser; Slack tokens encrypted at rest; workspace scoping on every query |
| Privacy | Code only stored as patches in `pr_file` for open PRs, purged 30 days after close; AI per-repo toggle |
| Cost | AI guide cost ≤ $0.05 per PR revision on average; tracked per workspace |
| Reliability | Jobs retried with exponential backoff, max 5 attempts; failed guide falls back without blocking review |

## 11. Pricing (to test)

| Plan | Price | Limits |
|---|---|---|
| Free | $0 | Up to 5 users, 3 repos |
| Team | $12–15 per user/month | Unlimited repos, Slack digest |

## 12. Success metrics

- **Speed:** median time from "review requested" to first review drops 30% within 4 weeks of adoption.
- **Activation:** % of workspaces that complete a review in the app within 24h of install (target ≥ 50%).
- **Retention:** weekly active reviewers / seats at week 4 (target ≥ 60%).
- **AI value:** % of guided reviews where the reviewer expands a step or ticks a checklist item (target ≥ 40%).

## 13. Milestones

| Week | Deliverable |
|---|---|
| 0 | Validation: hand-built guided view for 5 real PRs, timed against GitHub with 5 reviewers |
| 1 | GitHub App, webhook ingestion, PR mirror, board |
| 2 | Guided review view: risk ranking, diff, viewed state, actions |
| 3 | AI guide (job, cache, fallback), checklist, step filtering |
| 4 | Slack digest, workspace settings, billing; private beta with 5 teams |

## 14. Risks and open questions

1. **GitHub ships it.** GitHub's 2026 PR Inbox already covers personal queues. Our edge is the team view and guided review; watch their roadmap.
2. **AI guide quality.** A bad tour is worse than none. Build an eval set of 30 real PRs and grade step grouping and checklist usefulness before launch. Eval harness and the 30-PR set live in `packages/api/evals/guide/` (see its README).
3. **Diff rendering.** Building a good diff viewer is real work. Evaluate an existing library (e.g. `react-diff-view`, `@git-diff-view/react`) before writing one.
4. **Large PRs.** 100+ files exceed one guide call. v1: cap at 100 files and say so; v2: chunk by directory.
5. **Code privacy objections.** Some teams will refuse to send code to an LLM. The per-repo AI toggle and fallback guide keep the product usable without it.
6. **Open:** should the checklist state sync to GitHub as a comment? Default no.
7. **Open:** GitHub OAuth sign-in in v1, or keep email + password until beta?
