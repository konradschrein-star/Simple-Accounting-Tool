@AGENTS.md

# Cashflow — project conventions

Multi-tenant invoicing + bank-statement ingestion + AI bookkeeping + advisory-trigger lead magnet.
Approved build plan: `C:\Users\konra\.claude\plans\pasted-content-id-340b-you-are-inherited-sun.md`.

## Stack
Next.js 16 App Router (root-level `app/`, no `src/`), TypeScript strict, pnpm, shadcn/ui (radix-nova), Tailwind v4,
SQLite (better-sqlite3, WAL) + Drizzle 0.45, Better Auth (Google + organization + admin plugins), @react-pdf/renderer
(server-only), OpenRouter via `openai` SDK, vitest.

## Layout
- `app/` routes. `(public)` landing/signin/legal, `(app)` tenant screens, `console/`, `admin/`, `api/`.
- `server/` — `context.ts` (`requireOrg()`), `repos/*` (every function takes `orgId` first), `actions/*`.
- `db/` — `schema.ts`, `client.ts` (lazy), migrations in `drizzle/`.
- Domain modules (pure where possible): `jurisdictions/`, `money/`, `invoicing/`, `ingest/{csv,pdf,llm,verify}`,
  `bookkeeping/`, `advisory/`, `pdf/`, `demo/`.

## Rules
- Money = integer minor units. Dates = ISO `YYYY-MM-DD` strings. Timestamps = unix ms.
- Never read the clock inside domain logic: pass `today` (from `todayIn(tz)`) in.
- Rounding: line net = round-half-away-from-zero(qty_milli * unit / 1000); tax per rate group on summed nets.
- Never hold a DB transaction across `await` (better-sqlite3 transactions are sync).
- Tenant isolation: all tenant data access goes through `server/repos/*` with `orgId`; never query tenant tables from routes directly.
- Files only served via authenticated route handlers; uploads via Route Handlers (not Server Actions).
- Validate all external input (forms, API, env, LLM output) with zod.
- Keep files < 400 lines where reasonable; never > 1000.

## Commands
- `pnpm dev` · `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm db:generate` · `pnpm db:migrate`
