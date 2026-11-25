# ADR 0012: Hosting on Vercel with published days in Neon Postgres

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

The public app must serve each day's puzzle without ever holding future content in the
public repo (ADR 0003). The PRD planned a Vercel app reading published days from Postgres,
with a nightly job in the private repo publishing a short buffer ahead. Andy weighed running
everything on his laptop (simple, but reachable only at home, or exposed through a tunnel)
and chose hosting so friends can play from their phones.

## Decision

- **Neon Postgres**, free plan, AWS US East 1. One table, `puzzles (date, puzzle jsonb,
published_at, updated_at)`, in `packages/db/migrations/0001_puzzles.sql`.
- **Two least-privilege roles,** created in SQL (console-made roles get admin rights):
  - `fibble_reader` can only `SELECT`. Vercel's `DATABASE_URL` uses it.
  - `fibble_publisher` can `SELECT`, `INSERT` and `UPDATE`, but never `DELETE`. Only the
    private repo's publish job uses it.

  The owner's connection string is stored nowhere. `pnpm db:check` verifies each role's
  privileges.

- **The driver** is `@neondatabase/serverless` (HTTP), suited to Vercel functions: MIT
  licence, no dependencies. `packages/db` wraps it in a small `PuzzleStore`, which
  re-validates every day read against the shared schema and passes every value as a bind
  parameter.
- **The app** uses `PostgresContentSource` whenever `DATABASE_URL` is set, with no archive.
  Otherwise it reads files, so local development, previews and tests need no database.
- **Publishing:** `pnpm publish-days` plans today through today + 3 (UTC). Every day is
  checked: schema, date, no samples, banned topics. **Any invalid day stops the run before
  any write. A day that's already live is never changed.** The plan logic is pure and fully
  unit-tested.
- **Secrets:**
  - Locally they live in 1Password and are used through `op run`, so no real value sits on
    disk.
  - On Vercel and in GitHub Actions they are platform secrets.
  - Scripts refuse an unresolved `op://` reference with a clear message.

## Consequences

- **A leaked app credential can't change anything.** It can read at most 4 future days,
  because only that buffer is published.
- **Previews serve sample days,** because they get no database. That's deliberate: preview
  URLs are easier to share than production.
- Global stats, problem reports and the kill switch will need more tables and a role that
  can write player data. That's a future ADR.
- Vercel needs `ENABLE_EXPERIMENTAL_COREPACK=1` to use the pinned pnpm 12.
