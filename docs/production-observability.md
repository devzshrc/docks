# Production observability

## Runtime behavior

Cloudflare Workers Logs is the operational log store. Both Workers explicitly retain invocation logs, redact URL query strings, and sample traces at 10%. API logs are JSON with environment, release, event, severity and timestamp. No application database is needed to emit logs.

HTTP middleware validates or generates `x-request-id`, returns it on every response and exposes it through CORS. AsyncLocalStorage keeps concurrent requests isolated. Procedures emit `rpc.completed` with logical outcome/code and duration; HTTP requests emit `http.completed` with normalized route/status/duration. Use one source at a time when counting traffic. Expected tRPC validation/auth failures are warnings rather than grouped application errors. Unknown HTTP paths are `unmatched`; URLs, inputs, bodies and auth headers are never logged by the application.

Jobs persist the originating request ID in `jobs.request_id` and emit job ID/type/attempts/outcome/duration. Existing queued jobs have no originating ID. Deduplicated jobs retain the first enqueue's correlation. Terminal and retry transitions now update `updated_at`; historical completed timestamps are not backfilled. Procedures, jobs and actual AI calls create custom Cloudflare spans. Platform fetch/KV instrumentation provides dependency spans; per-query PostgreSQL spans are not implemented. Local Node execution uses the same logs without Cloudflare spans.

Caught operational errors emit their type and operation without raw provider messages. Redacted detailed stacks remain in the existing admin-only grouped error store. Raw runtime failures may still be captured by Cloudflare itself. Browser errors use the existing PostHog exception autocapture plus a Next.js route error boundary. Exception export removes common credentials, query strings and source context; no regex can guarantee removal of arbitrary personal data embedded in a custom exception, so do not construct exceptions from customer inputs. Browser errors carry build release metadata.

`GET /healthz` is liveness. `GET /readyz` opens a separate bounded PostgreSQL connection through Hyperdrive in Workers and through DATABASE_URL in Node. Connection and query timeouts are two seconds each. It returns 200/503 with only `ok`/`unavailable` and disables caching.

Each cron emits scheduler completion and a five-minute `health.snapshot`: ready jobs, oldest ready age, stale running count, AI failures/p95 and webhook failures. Future scheduled jobs are excluded from ready backlog. A successful scheduling/draining/health evaluation sends an optional HTTPS heartbeat. Scheduler, queue polling or health-evaluation failures withhold it. Individual job failures remain retryable and emit their own errors; a cron heartbeat is not evidence that every job succeeded. Heartbeat delivery is bounded to three seconds and never logs its secret URL. Node development does not send cron heartbeats.

`/admin/health` refreshes job summaries every 15 seconds and errors/webhooks every 30 seconds while the page is active. It displays observed time, prior-data warnings after failed refresh, AI/webhook five-minute summaries and the most recent successful deployment. Ten-minute running age is a diagnostic indicator, not automatic retry permission. Existing admin authorization, 2FA and audited retry rules remain enforced.

Hourly cleanup removes up to 1,000 expired rows per table: grouped errors and webhook deliveries after 90 days, AI calls after 365 days. Rows can remain longer when incoming volume exceeds cleanup capacity; tune batch/cadence from observed volume. Billing/audit/deployment history is preserved. Cloudflare/PostHog retention is configured in those services separately.

## Activate production

1. Apply generated migrations `0025` (job correlation) and `0026` (AI/billing telemetry and deployment markers) through the existing CI migration gate. Preserve existing migration `0024`. The new migrations are additive; older app revisions ignore the added column/tables.
2. Deploy through the existing pipeline. CI passes RELEASE_SHA to the API and NEXT_PUBLIC_RELEASE_SHA to the web build. After both Workers and smoke checks succeed, it inserts an idempotent deploy marker keyed by repository/run/attempt. Marker failure reports that the app was deployed; retry that step without blindly redeploying. Source map preparation happens before Worker uploads.
3. Keep the existing PostHog project key/host configured. Enable Error Tracking in that project. For private source maps, set repository variable POSTHOG_SOURCE_MAPS_ENABLED=true and POSTHOG_PROJECT_ID, and deployment secret POSTHOG_CLI_API_KEY with the appropriate source-map write permissions. The upload action and CLI version are pinned. Production builds generate browser maps; deployment uploads and removes them, or removes them without upload when disabled. Personal API keys never enter client builds. Cloudflare web server exception SDK integration and server source-map upload to PostHog are not included; Worker platform exceptions remain available in Cloudflare.
4. External uptime monitoring and email alerting are deferred. No provider integration or external monitors have been activated.
5. The Worker supports an optional HTTPS cron heartbeat through the `MONITOR_HEARTBEAT_URL` secret. Leave it unset while external monitoring is deferred. If enabled later, store it with `pnpm --filter @docks/server exec wrangler secret put MONITOR_HEARTBEAT_URL`; never put the URL in versioned configuration or browser variables.
6. Configure Cloudflare log queries/automations or export to your existing observability provider for the rules below. Cloudflare supports log/trace export; destination credentials and alert policies belong to the provider account. No custom in-app rule engine or incident persistence is introduced.

## Initial alert rules

- API unexpected failures: `rpc.completed` INTERNAL_SERVER_ERROR/TIMEOUT above 2% over five minutes, minimum 100 procedures; separately alert on HTTP 5xx for non-RPC routes. Never sum HTTP requests and RPC procedures.
- Latency: p95 duration from rpc.completed exceeds a procedure-specific budget for ten minutes. Exclude long-running AI procedures from ordinary API latency budgets.
- Queue: health.snapshot oldestReadyAgeMs exceeds the operation's processing budget or staleRunning is nonzero for consecutive evaluations. Inspect idempotency before retrying a running job.
- AI: health.snapshot aiFailures/aiCalls above 10% with at least 20 calls; no calls means no data. Separate refusals and cached results from provider errors.
- Webhooks: health.snapshot webhookFailures/webhookCalls above 5% with at least 20 deliveries. Signature rejections are a separate security signal.
- Scheduler/telemetry: missing external heartbeat, cron.failed, scheduler.task_failed, monitor.heartbeat_failed or repeated recorder failures. A missing snapshot is unknown, never a healthy zero.

Start with these thresholds, then tune using normal traffic. Configure one incident per service/rule, a notification cooldown, recovery, an accountable owner and a runbook link in the provider. External uptime and missing-heartbeat alerts must work without Postgres or the app scheduler. Billing and AI dollar-cost alerts require versioned prices/account configuration; token telemetry alone is not an accurate spend estimate.

## Incident response

Open Cloudflare Workers Logs for docks-api/docks-web, filter by requestId/jobId/release/event, inspect the sampled trace, and compare the latest CI/deploy marker. Use the admin Health page for queue, webhook and AI details. During an active investigation:

```bash
pnpm --filter @docks/server exec wrangler tail
pnpm --filter @docks/web exec wrangler tail
```

Check readiness and database/provider connectivity. For jobs, inspect attempts, ready age and event type; only use the existing authorized retry action when safe. For webhooks, verify delivery outcome before redelivery. Restore the last known good application build if necessary; keep additive migrations and audit history. Confirm readiness, heartbeat and incident recovery after mitigation.

Disable browser capture by removing the PostHog project key or disabling exception capture in project configuration. Disable heartbeat by removing its Worker secret. Reduce tracing sampling or disable traces in both Wrangler configs if overhead requires it. These controls do not change product behavior.

## Verification and remaining account work

Automated gates cover request context isolation, redaction, readiness response/CORS, heartbeat failures, job correlation/timestamps, retention, migrations applied twice, and authenticated desktop/mobile health summaries. Existing API/server/web tests and Worker build checks remain in CI. Staging fault injection and actual notification/recovery delivery require the external monitors and approved recipient to be configured; do not claim alerts are active until those checks pass.

References: [Cloudflare traces and custom spans](https://developers.cloudflare.com/workers/observability/traces/custom-spans/), [live logs](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/), [PostHog Error Tracking](https://posthog.com/docs/error-tracking/start-here), [source-map upload action](https://github.com/PostHog/upload-source-maps).
