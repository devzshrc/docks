# Product analytics

Docks initializes PostHog after React mounts, using `apps/web/src/lib/posthog.ts`.
Initialization runs from the root analytics provider to avoid SDK scripts mutating
the page before hydration.
The React provider identifies authenticated users by Better Auth user ID and
resets identity when the session ends. Email and name are person properties.

Pageviews (including client navigation), pageleaves, interaction autocapture,
and browser exceptions are enabled. Session replay follows the project's
PostHog recording settings; all input values and page text are masked.
Autocapture masks text and attributes as well. Add `ph-no-capture` or `ph-no-record`
to any additional sensitive UI that should be excluded entirely.
Authentication pages are excluded from replay; hidden and file inputs are
blocked. Analytics URL properties omit query strings and fragments so password
reset tokens are not retained.

Set `NEXT_PUBLIC_POSTHOG_KEY` to the public project token and
`NEXT_PUBLIC_POSTHOG_HOST=/ingest` before building. `/ingest` proxies the US
PostHog ingestion and static asset endpoints. These are build-time variables;
changing a Worker runtime variable alone will not update the browser bundle.
GitHub Actions uses repository variables with the same names for the production
Cloudflare artifact. The local example leaves the project key empty to disable
analytics. Never put a PostHog personal API key in a public variable.

CI builds browser tests with a dummy project token. The analytics browser test
intercepts ingestion and asserts actual event payloads for anonymous visits,
SPA navigation, identification, and logout reset. It sends no events to the
production PostHog project.

Open the US PostHog project to see Activity, Product analytics, People,
Session replay, and Error tracking. Enable recording in the project settings
if recordings are wanted. Existing Docks admin database metrics remain separate
from PostHog behavioral analytics.
