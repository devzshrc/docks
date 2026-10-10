# Platform administration

Open `/admin` for the CRM-inspired operations dashboard: overview, users, workspaces, usage/retention, audit trail and failed jobs. `/admin/metrics` retains the beta metrics screen.

## Access

Configure comma-separated emails on the API server:

- `ADMIN_EMAILS`: owners; all controls, including suspension and complimentary premium.
- `ADMIN_SUPPORT_EMAILS`: read access, device/session revocation and safe sync retries.
- `ADMIN_VIEWER_EMAILS`: read access only.

Roles come from deployment configuration, never workspace membership or a browser parameter. Every administrator must verify their email and enable two-factor authentication in Account settings. Mutations require a session created within the last 30 minutes; sign out and sign in again when prompted. Platform owners cannot be suspended from the dashboard. Support cannot revoke another administrator's sessions.

GitHub-only accounts must create a Docks password before enabling two-factor authentication. Account settings detects the sign-in methods and offers **Send password setup link** instead of asking for a nonexistent current password. Follow the emailed link to choose a password, return to Account settings to enable and verify the authenticator, then sign in with email/password and the authenticator code to access administration.

Changes require a reason and commit atomically with their audit record. The audit trail records successful operations with actor, target, request ID and operation metadata. Failed operations return an error and do not produce a successful change record. There is no dashboard operation to edit or delete audit entries.

## Controls and data

User search supports account status and pagination. Details include authentication methods, verification/2FA state, workspace memberships, recent product events, recorded logins and active sessions. Device labels infer browser/OS from user agents; IP addresses are reported without invented geography. Session refresh timestamps are not continuous device tracking. Passwords, authentication tokens and integration credentials are excluded.

Suspension revokes all sessions, blocks new sessions and blocks protected API calls. Reactivation permits a fresh sign-in. Session cookie caching is disabled so revoked sessions cannot remain valid through the old five-minute cache.

Premium grants apply to the selected workspace and therefore its members. They can expire or remain indefinite. Granting replaces previous unrevoked grants; revocation affects complimentary access only. Paid billing fields and Dodo subscriptions remain untouched. The existing feature and limit guards resolve paid Team OR a currently valid grant. Expiry takes effect on the next guarded request without a scheduled job. Billing settings identify complimentary access explicitly.

Usage counts meaningful activity (`pr_opened`, `review_submitted`, `issue_created`). Registration charts use UTC calendar days, including today. The activation funnel follows registration → workspace creation → GitHub connection → first review using recorded events. Week-two retention uses first-review cohorts with 14 days of observation and meaningful activity during days 7–14. Missing historical events are not reconstructed. Successful/failed email login tracking starts at deployment; failed attempts are aggregated without retaining attempted email addresses.

Job retry is limited to failed sync jobs (`sync_repo`, `sync_pr`, `sync_user_repos`, `sync_issues`, `sync_issue`). Locking prevents duplicate retries. Message-sending and remote-write jobs require manual investigation. Raw job payloads/errors are excluded because they can contain credentials.

## Rollout

1. Back up the database and apply additive migration `0022_free_tony_stark.sql` through the existing Drizzle migration runner **before** deploying the API. The migration creates `account_control`, `premium_grant`, `admin_audit`, and `auth_event` without rewriting existing users or subscriptions.
2. Configure the API role email lists; deploy API and web from the same revision.
3. Verify an owner with a verified email and configured 2FA can open `/admin`, while an ordinary workspace owner cannot.
4. Confirm a complimentary grant on a test workspace, its audit entry and revocation; confirm device sign-out using a second real session.

The GitHub workflow now gates deployment on real PostgreSQL integration tests, server/web unit tests, type checks, desktop/mobile Playwright tests, and Cloudflare production builds. See [CI-CD.md](CI-CD.md) for exact login and CI setup instructions. Production migration still requires the repository's `DATABASE_URL_DIRECT` secret; Cloudflare deployment requires its existing credentials. A missing production secret is a rollout blocker, not a reason to skip migrations.

For rollback, revert the application revision first. Keep the additive tables and audit history; old code ignores them. Expired or revoked grants do not change billing records. Do not drop administration tables while this application version is serving requests.

## Validation

Use a disposable migrated PostgreSQL database with identical `DATABASE_URL` and `DOCKS_TEST_DATABASE_URL` values; the integration suite refuses a non-test database. Run `pnpm --filter @docks/api test`, `pnpm --filter @docks/web test`, API/server type checks, and `pnpm --filter @docks/web build`. Existing tests are retained unchanged. New tests cover role/2FA/fresh-session restrictions, session isolation, real Better Auth sign-ins and immediate revocation, suspension/reactivation, paid-versus-complimentary entitlement boundaries, safe retry restrictions and transaction rollback when audit insertion fails.
