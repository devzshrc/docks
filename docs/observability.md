# Observability

Current production logging, tracing, readiness, release metadata, retention, and activation instructions: [Production observability](./production-observability.md).

The phase inventory below is historical; use the runtime guide and schema for implemented status.

Phase 0 (this change): best-effort `write_event` in `packages/api/src/observe.ts`.
It inserts one row into a given table, catches all errors with `console.error`,
and never throws — same contract as `audit` (`access.ts`) and `track`
(`analytics.ts`). No new tables yet; no per-repo mirror tables are planned.

## Planned tables (one per phase, Phases 1–7)

| Phase | Table | Columns | Keep time |
|---|---|---|---|
| 1 | `server_error` | hash (PK, sha256 of normalized message), message, stack (admin-only), total, first_at, last_at; route/job context as message prefix | 90 days |
| 2 | `webhook_delivery` | id, delivery_id, installation_id, event, result (ok/failed/signature_rejected), reason, duration_ms, received_at; no payload storage | 90 days |
| 3 | `ai_call` | id, at, workspace_id, repo_id, model, input_tokens, output_tokens, latency_ms, cached, meta (jsonb) | 1 year |
| 4 | `api_call` | id, at, route, status, duration_ms, user_id, workspace_id | 30 days |
| 5 | `billing_event` | id, at, workspace_id, kind, amount_cents, meta (jsonb) | 7 years |
| 6 | `alert_rule` | id, name, threshold, channel, enabled, created_at, updated_at | config, keep indefinitely |
| 7 | `deploy_mark` | id, at, sha, actor | keep indefinitely |

## Table workflow (confirmed, Phase 0 adds none)

Drizzle schema in `packages/db/src/schema/` + SQL migrations in
`packages/db/drizzle/` (latest: `0024`). New tables later follow:
edit schema → `pnpm --filter @docks/db db:generate` → review the new
`00NN_*.sql` → `pnpm --filter @docks/db db:migrate`.
