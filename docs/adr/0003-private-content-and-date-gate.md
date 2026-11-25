# ADR 0003: Private content repo and a date-gated API

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

The code is public (AGPL-3.0). If future puzzles lived in the public repo or the production
database without a gate, anyone could read tomorrow's answers. Wordle-style games rely on
everyone getting the same puzzle at the same time.

## Decision

- Approved puzzles live in a **private** `fibble-content` repo, never in this one. The public
  repo ships only `content-example/` with three sample days marked `"sample": true`.
  `content/` is git-ignored as a safety net.
- A nightly job publishes only **today through today + 3** to production Postgres.
- The API serves a date only once it has **started in UTC+14**, and refuses dates more than a
  day past their end unless archive access is on.
- Unreleased and missing dates return the same 404.
- The puzzle payload never includes answers. Answers come one round at a time from the answer
  endpoint, after a choice.

## Consequences

- A leak requires breaking into the private repo or the database, not reading GitHub.
- Players in UTC+14 can start a date up to 26 hours before players in UTC-12; this matches local-midnight resets.
- The client can still call the answer endpoint to peek, but only at its own game. Accepted.
- Contributors can run the full app locally with sample content and no secrets.
