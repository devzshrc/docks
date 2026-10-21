# Docks

Find the GitHub pull requests waiting for your review, understand the changes, and send your review back to GitHub.

Docks brings review requests into one inbox. Open a pull request to read its diff, follow a review guide, or ask questions about the code. When the author pushes another commit, see what changed since your last review.

[Open Docks](https://docks.devzshrc.in) · [Run locally](#run-locally) · [Deployment guide](docs/DEPLOY.md)

## From review request to follow-up

### Find your next review

Your inbox separates requests waiting for you, updates since your last review, and your own pull requests. Accept a review, snooze it until later, or check which reviews are overdue. GitHub reviewer requests remain the source of truth.

### Read the changes with context

Read changed files and use a review guide to decide where to start. Ask questions about a pull request or a specific file. Docks supplies the current diff and bounded file context to the AI, along with any repository knowledge documents you select. Answers include validated code citations so you can inspect the referenced lines.

Questions and answers are private to the person asking them and tied to the pull request's head commit. Earlier answers are marked outdated after the code changes. Follow-up questions use conversation history from the current commit.

### Finish the review in GitHub

Post comments or an approval from Docks. Turn a review thread or saved AI answer into a GitHub issue when work needs a follow-up. The issue retains a link to its source pull request; creating it does not resolve the review thread.

### Coordinate reviews across a team

Team plan features include review deadline policies, reminders, and escalation to backup reviewers. Policies follow the repository's configured work schedule and pause for draft pull requests. Release views collect selected pull requests and show their merge readiness, including gaps when GitHub cannot supply complete requirements.

For workflow details and current limits, see the [review workflow](docs/review-workflow.md) and [deployment notes](docs/DEPLOY.md).

## How AI fits into a review

AI features require an OpenAI API key on the server and must be enabled for the repository. Docks uses the pull request description, a bounded diff, and selected file context rather than sending the entire repository. Repository knowledge documents provide additional reference material.

Repository access checks protect AI requests and saved conversations. Answers retain the commit and knowledge revisions used to produce them. Code citations point to the supplied changes; new-side citations open immutable GitHub commit links.

AI answers still need a reviewer's judgment. The [review workflow documentation](docs/review-workflow.md#ai-bounds-and-evidence) explains context limits, quotas, and citation behavior.

## Run locally

Use Node.js 22, pnpm, and Docker for the local Postgres database. The repository pins its pnpm version in `package.json`.

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
```

In `apps/server/.env`, replace `BETTER_AUTH_SECRET` with a random secret of at least 32 characters. Generate one with:

```bash
openssl rand -base64 32
```

Start Postgres, apply the migrations, and run the web and API servers:

```bash
pnpm db:up
pnpm db:migrate
pnpm dev
```

The web app runs at `http://localhost:3000`, the API at `http://localhost:4000`, and Postgres at `localhost:5433`. The example environment files use these addresses.

### Connect the services you need

The base app needs the database and auth configuration. To use GitHub review workflows, configure a GitHub App and its OAuth credentials in `apps/server/.env`.

| Service       | Configuration                                                   | Purpose                                                                      |
| ------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| GitHub        | `GITHUB_APP_*`, `GITHUB_WEBHOOK_SECRET`, `TOKEN_ENCRYPTION_KEY` | Repository access, webhook sync, and reviews performed as the connected user |
| OpenAI        | `OPENAI_API_KEY`                                                | AI review guides and questions about code                                    |
| Resend        | `RESEND_API_KEY`, `EMAIL_FROM`                                  | Verification, password reset, and invitation emails                          |
| Slack         | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`                        | Team notifications                                                           |
| Dodo Payments | `DODO_PAYMENTS_*`                                               | Team plan subscriptions                                                      |

The [server environment template](apps/server/.env.example) documents each variable and the GitHub callback URLs. Without a Resend key, development emails are printed to the server log.

## Codebase

Docks uses a Next.js frontend and a Hono API with tRPC. Better Auth manages authentication, and Drizzle connects to Postgres. Shared TypeScript packages keep API contracts consistent between the browser and server.

```text
apps/
  web/                 Next.js frontend
  server/              Hono API, integrations, and background jobs
packages/
  api/                 tRPC routers, auth, and application logic
  db/                  Drizzle schema and migrations
  typescript-config/   Shared TypeScript configuration
```

Production runs on Cloudflare Workers. The web app uses OpenNext; the API reaches Postgres through Hyperdrive. A scheduled Worker runs background jobs. See the [deployment guide](docs/DEPLOY.md) for configuration and rollout steps.

## Working on Docks

Choose a concrete bug or workflow improvement and describe the expected behavior in an issue or pull request. For a UI change, include screenshots. For a behavior change, explain how you checked it.

The workspace provides these commands:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

Some checks need a configured database or external services. Read the relevant package scripts and [CI documentation](docs/CI-CD.md) before running the full suite. The [AI evaluation guide](packages/api/evals/guide/README.md) covers review-guide evaluations.

## Documentation

- [Review workflow](docs/review-workflow.md): inbox behavior, AI context, knowledge documents, and follow-up issues.
- [Deployment](docs/DEPLOY.md): local Worker setup, integrations, and production rollout.
- [CI and releases](docs/CI-CD.md): checks, deployment gates, and environment configuration.
- [Production observability](docs/production-observability.md): operational telemetry and troubleshooting.
- [UI guidance](docs/UI.md): interface conventions for contributors.
