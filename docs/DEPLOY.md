# Deploying Docks on Cloudflare

Two Workers: `docks-web` (Next.js via OpenNext, `app.<domain>`) and `docks-api` (Hono, `api.<domain>`).
Postgres is Supabase, reached from the API Worker through Hyperdrive. Background jobs run on a per-minute Cron Trigger.

## One-time setup
1. `pnpm exec wrangler login` (or set `CLOUDFLARE_API_TOKEN`).
2. Supabase: copy the **direct** connection string. Run migrations with it: `DATABASE_URL=<direct> pnpm --filter @docks/db exec drizzle-kit migrate`.
3. `pnpm exec wrangler hyperdrive create docks --connection-string="<supabase direct or pooler url>"`, then put the id in `apps/server/wrangler.jsonc`.
4. In `apps/server/wrangler.jsonc` set `vars` (`CLIENT_URL`, `BETTER_AUTH_URL`, `COOKIE_DOMAIN`) and add `routes` for `api.<domain>`; in `apps/web/wrangler.jsonc` add a route for `app.<domain>`.
5. Secrets, one per `wrangler secret put <NAME>` from `apps/server`: `BETTER_AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `OPENAI_API_KEY`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `DODO_PAYMENTS_*`, `ADMIN_EMAILS`, `CORS_ORIGINS` (if needed).
6. Point third parties at the API origin: GitHub App callback URLs (`/api/auth/callback/github`, `/integrations/github/oauth/callback`), Setup URL (`/integrations/github/callback`), Webhook URL (`/webhooks/github`); Slack redirect (`/integrations/slack/callback`); Dodo webhook (`/webhooks/dodo-payments`).

## Deploy
- API: `pnpm --filter @docks/server cf:deploy`
- Web: `NEXT_PUBLIC_SERVER_URL=https://api.<domain> pnpm --filter @docks/web deploy`
- CI: `.github/workflows/deploy.yml` (needs repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL_DIRECT`, and variable `NEXT_PUBLIC_SERVER_URL`).

## Local
- Node: `pnpm --filter @docks/server dev` (Express-free Hono server plus the poll loop).
- Worker: copy secrets into `apps/server/.dev.vars`, then `pnpm --filter @docks/server cf:dev` (Hyperdrive uses the local Docker Postgres).
- Web on Workers runtime: `pnpm --filter @docks/web preview`.

## Review inbox and recovery rollout

- Apply migration `0020_numerous_venom.sql` before deploying the API and web. It adds review events, personal inbox items, and private review sessions without changing existing data.
- Subscribe the GitHub App to `pull_request`, `pull_request_review`, `pull_request_review_comment`, `check_run`, and `status` events. The existing job worker delivers inbox items. Only events received after deployment appear in the inbox.
- Merge readiness reads branch protection and active rulesets with the connected user's GitHub permissions. If GitHub does not return complete requirements, the UI shows an unknown state and a link to GitHub.
- Draft recovery uses server versions to detect concurrent edits. Local copies are scoped to the signed-in account. Users must explicitly choose a copy after a save conflict.

## Paid review workflow rollout

- Apply migration `0021_stiff_the_liberteens.sql` before deploying the API and web. It adds deadline policies, cycles, notification delivery records, releases, evidence snapshots, and nullable review commit metadata.
- The existing minute-based scheduler handles reminders and escalation. Policies are off until an owner or admin enables them on `/deadlines`. Automation and paid mutations require the Team plan at execution time.
- Each repository policy stores its work schedule and escalation lead. Cycles retain a copy of their original policy. Draft PRs pause the clock. A new policy starts clocks when PRs next sync, without retroactive deadlines.
- Slack alerts use the existing configured incoming-webhook channel. Inbox delivery is deduplicated. A Slack timeout after acceptance can cause a duplicate on retry because incoming webhooks provide no idempotency key.
- `/releases` supports up to 100 explicitly selected PRs. Readiness expires after 15 minutes or a changed head. Refresh work checks the requesting user's current repository access.
- Evidence collection uses review webhooks and PR sync, including GitHub actions performed outside Docks. Older decision history and checks at review or merge time can be incomplete. CSV/JSON exports identify gaps and record limits. Snapshots are not compliance certification or tamper-proof records.
- Incremental review compares the last submitted review commit, including mirrored external reviews. Incomplete comparisons fall back to the full diff. Personal checklist answers persist across commits only when all linked file blobs remain unchanged.
