# CI/CD and dashboard access

## What runs

`.github/workflows/deploy.yml` runs on pull requests to `main`, pushes to `main`, and manual dispatch. The stable required-check name is **Tests and release build**.

The test job installs the locked dependencies on Node 22, creates disposable PostgreSQL, applies migrations twice to verify repeatability, checks API/server/browser-fixture types, runs API integration/unit tests and server/web unit tests, builds Next.js, then runs Playwright on desktop and mobile Chromium. Browser fixtures use a separate local test database, real Better Auth password/TOTP setup and sessions; they do not mock the admin API or bypass its authorization. Production rate limiters stay enabled with isolated client IPs.

The job also bundles the API Worker with Wrangler's dry run and builds the production OpenNext Worker. It uploads the Cloudflare web artifact tied to the commit SHA. Failed browser runs retain their HTML report, trace, screenshot and video for seven days. There are no automatic test retries and focused tests (`test.only`) fail CI.

Deployment runs only on `main` after the test job succeeds. Pull requests never deploy or receive production secrets. Main pipelines serialize to prevent overlapping schema/application releases. The deployment job validates secrets before changing anything, restores that exact commit's web artifact, applies production migrations, deploys API and web, and checks the live health endpoint, dashboard/login routes and unauthenticated admin denial. A failed smoke check marks the release failed; it does not attempt an automatic schema rollback.

## Credentials and controls

Set these in [GitHub Actions secrets](https://github.com/devzshrc/docks/settings/secrets/actions), or in the `production` environment's secrets:

- `CLOUDFLARE_API_TOKEN`: Cloudflare's **Edit Cloudflare Workers** token template, scoped to the Docks account and `devzshrc.in` zone. Obtain it in Cloudflare → My Profile → API Tokens. Store it directly in GitHub; never commit it or paste it into chat. OAuth login used on a developer laptop is not an unattended CI credential.
- `CLOUDFLARE_ACCOUNT_ID`: the Docks Cloudflare account identifier.
- `DATABASE_URL_DIRECT`: a migration-capable PostgreSQL URL. The configured Supabase session pooler on port 5432 works for IPv4 GitHub runners; do not use transaction pooling on port 6543 for migrations.

The account ID and database URL were configured during setup. The API token remains the one-time credential needed to turn on unattended deployment.

Supabase TLS uses `sslmode=verify-full` and the public CA certificate in `scripts/certs/supabase-root-2021.crt`, loaded with `NODE_EXTRA_CA_CERTS`. Certificate and hostname verification remain enabled. Certificate source: [Supabase SSL settings](https://supabase.com/docs/guides/platform/ssl-enforcement); the bundled public CA expires in April 2031. Replace it when Supabase rotates its CA.

Create/configure the GitHub `production` environment if you want deployment reviewers or branch restrictions. Under repository Settings → Branches/Rulesets, require **Tests and release build** for changes to `main`. The workflow itself gates releases; branch protection additionally prevents users bypassing CI when merging. These repository policies are intentionally separate from the workflow.

API runtime secrets (Better Auth, GitHub, billing, encryption and email) stay on the existing `docks-api` Cloudflare Worker. Deploying does not copy them into the browser artifact. Production uses `https://api.devzshrc.in`; browser tests use the local API.

## Sign in to the dashboard

The platform owner email is configured privately in the API Worker's `ADMIN_EMAILS` secret.

1. Open [Docks login](https://docks.devzshrc.in/login?next=%2Fadmin). Use the existing Docks account for that email. If it does not exist, sign up with that email and verify it using the emailed link. There is no separate administration password.
2. In [Account settings](https://docks.devzshrc.in/settings/account), enable two-factor authentication, scan the QR code with an authenticator app, confirm its six-digit code and save the backup codes.
3. Sign out and use the login link again. Enter the password and authenticator code.
4. Open [Administration](https://docks.devzshrc.in/admin). Account/settings pages use the same session.

Administration is independent of workspace ownership. Only configured platform emails can enter, with verified email and enabled 2FA. Access-changing operations require a sign-in within the last 30 minutes; sign out and sign in again when prompted. GitHub sign-in can also use the same verified account; email/password signup is the most direct route for initial authenticator setup.

Changing `ADMIN_EMAILS` is done on Cloudflare → Workers & Pages → `docks-api` → Settings → Variables and Secrets. `ADMIN_SUPPORT_EMAILS` and `ADMIN_VIEWER_EMAILS` are optional comma-separated lower-privilege lists.

The dashboard URL becomes available after the dashboard revision and migration are deployed. A successful source push alone does not mean a successful production release; check the **Deploy production** job in GitHub Actions.

## Run locally

Start the existing Docker PostgreSQL, then use a disposable database whose name contains `test` for integration and browser tests:

```sh
export DATABASE_URL=postgresql://docks:docks@localhost:5433/docks_admin_test
export DOCKS_TEST_DATABASE_URL="$DATABASE_URL"
export BETTER_AUTH_SECRET=local-test-only-secret-at-least-32-characters
pnpm --filter @docks/db build
pnpm --filter @docks/db db:migrate
pnpm --filter @docks/api build
pnpm --filter @docks/api test
pnpm --filter @docks/server test
pnpm --filter @docks/web test
NEXT_PUBLIC_SERVER_URL=http://localhost:4000 pnpm --filter @docks/web build
pnpm --filter @docks/web exec playwright install chromium
pnpm --filter @docks/web test:e2e
```

Playwright owns ports 3000/4000 and refuses to reuse existing servers. It starts the production Next.js server and a test-only API entry point without the background worker or production dotenv files. Credentials are temporary fixtures under ignored `e2e/.auth/` and are removed on graceful shutdown. Run `pnpm --filter @docks/web exec playwright show-report` to inspect the browser report.

For ordinary local usage, `/admin` is at `http://localhost:3000/admin`; set `ADMIN_EMAILS` on the local API and use a verified, 2FA-enabled local Docks account. Local and production accounts are separate databases.

## Failed deployment and rollback

If tests fail, no deployment runs. If secrets are missing, no production migrations or uploads run. If deployment or smoke checks fail after migrations, inspect the failed step and Cloudflare logs. Redeploy the last known good application revision; preserve additive database tables and audit history. Never drop migrated tables while a revision that uses them is live. See `docs/admin-dashboard.md` for administration-specific rollout behavior.
