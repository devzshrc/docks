# Docks — production-grade Turborepo + tRPC monorepo

Live: [docks.devzshrc.in](https://docks.devzshrc.in)

Next.js client (`apps/web`) → Express tRPC server (`apps/server`) sharing routers via `@docks/api` (`packages/api`), auth via Better Auth + Postgres (Drizzle).

## Stack

- Turborepo 2 + pnpm workspaces + TypeScript strict
- tRPC v11 + SuperJSON + Zod validation
- Next.js 15 (client) with `@trpc/tanstack-react-query` + TanStack Query v5 + BoardUI (with existing Radix adapters)
- Express 4 + helmet + cors + morgan (server)
- Better Auth 1.x (email + password) + Drizzle ORM + Postgres 16 (docker compose)

## Structure

```
apps/
  web/        Next.js frontend — imports only `type { AppRouter }`, never server runtime
  server/     Express + createExpressMiddleware(appRouter) + Better Auth handler at /api/auth
packages/
  api/        auth.ts (Better Auth instance), trpc.ts, context.ts, routers/health + user + _app
  db/         Drizzle client (pg Pool singleton), schema/*, drizzle/ migrations, drizzle.config.ts
  typescript-config/  shared base/nextjs/node tsconfigs
turbo.json    build/dev/lint/typecheck/test pipelines with caching
docker-compose.yml  Postgres 16 (host port 5433 — 5432 is often taken)
```

## tRPC wiring

1. Define in `packages/api`: `initTRPC.context<Context>()` + `superjson` + Zod error formatter.
2. `publicProcedure` / `protectedProcedure` (isAuthed middleware → UNAUTHORIZED).
3. Feature routers (`health`, `user`) merged in `routers/_app.ts` → `export type AppRouter`.
4. Server builds `Context { user, requestId }` per request via `auth.api.getSession()`, mounts routers at `/trpc`.
5. Web creates typed hooks in `apps/web/src/trpc/react.tsx` via `createTRPCContext<AppRouter>` + `httpBatchLink({ url: SERVER_URL/trpc, credentials: "include" })`.

Rules: Zod on every input, `TRPCError` with codes (NOT_FOUND/UNAUTHORIZED), never export runtime router to client — type-only.

## Auth + database

- `packages/api/src/auth.ts` — `betterAuth({ database: drizzleAdapter(db, { provider: "pg", schema }), emailAndPassword: { enabled: true } })`.
- Auth tables (`user`, `session`, `account`, `verification`) are Better Auth–owned: generated with `npx auth generate`, singular names as the adapter requires. Re-run generate after adding plugins.
- Queries use the `db.select()` builder, never `db.query.*`. `user.list/getById` read the `user` table; sign-up is Better Auth only (no tRPC `create`).
- Web: `src/lib/auth-client.ts` (`createAuthClient` → `<server>/api/auth`), session cookie flows into tRPC via `credentials: "include"`; `trustedOrigins` + CORS `credentials: true` must match the web origin.

## Web routes (shadcn blocks)

Blocks installed from the registry (`@shadcn/login-01`, `@shadcn/signup-01`, `@shadcn/dashboard-01`) and wired to real data — no mock users:

- `/` → redirects to `/dashboard`
- `/login` — login-01 form → `signIn.email`, lands on `/dashboard`; links to `/signup`
- `/signup` — signup-01 form → `signUp.email`, lands on `/dashboard`
- `/dashboard` — dashboard-01 shell (sidebar + header + section cards + chart + users table), wrapped in `RequireAuth` (session cookie lives on the API origin, so the guard runs client-side and redirects to `/login` when anonymous)
  - Section cards: total users (`user.list`), API status (`health.check`), signed-in account (`user.me`), email verification
  - Users table: live `user.list` data (name/email/status/joined)
  - Sidebar user menu + header sign-out both call `signOut` → `/login`

## Run

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # set BETTER_AUTH_SECRET (openssl rand -base64 32)
cp apps/web/.env.example apps/web/.env.local

pnpm db:up        # Postgres via docker compose (localhost:5433)
pnpm db:migrate   # apply drizzle migrations (or db:push for dev sync)

pnpm dev            # both, prefixed [web] (cyan) / [server] (magenta) via concurrently
pnpm dev:tmux       # both, each in its own tmux window (docks/server + docks/web) — works in any terminal
pnpm dev:tabs       # both, each in a native terminal tab (Terminal.app/iTerm2 via ttab; needs Automation permission)
pnpm dev:server     # Express :4000 — /healthz, /trpc, /api/auth
pnpm dev:web        # Next.js :3000

pnpm build typecheck lint test
```

Verify auth: `GET /api/auth/ok` → `{ok:true}`; sign-up `POST /api/auth/sign-up/email {name,email,password}`.

## Deploy notes

- Server: `pnpm --filter @docks/server build && node dist/index.js` (set PORT, CLIENT_URL, CORS_ORIGINS, DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL).
- Web: set `NEXT_PUBLIC_SERVER_URL=https://api.example.com`, then `pnpm --filter @docks/web build`.
- DB: run `pnpm db:migrate` with the production `DATABASE_URL` (migrations live in `packages/db/drizzle`).
- Turbo remote cache: `npx turbo login && npx turbo link`.
