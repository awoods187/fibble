# Project status

The single place to see where Fibble is. **Update it in every PR that changes the picture.**
Numbers only: real truths, lies and rounds stay in the private `fibble-content` repo.

_Last updated: 2026-11-25._

## Where we are

**Phase:** the content pipeline works end to end (stages 1–5). Next: **hosting**, then full
days of content, then the playable game.

| Area               | State                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repos              | `fibble` (public, `main` protected, CI required) · `fibble-content` (private, honor-system merges on GitHub Free)                                                                             |
| Security           | Keyless Claude auth; secret scanning (GitHub on public, `check:secrets` + pre-commit hook on private); SHA-pinned actions; security headers; banned-topic filter ([security.md](security.md)) |
| Web app            | Date-gated puzzle API, answer endpoint, leak tests. The page only **shows** round 1; there's no play loop yet                                                                                 |
| Content in `bank/` | **None yet.** No day has been assembled or reviewed                                                                                                                                           |
| Hosting            | **Not started.** Plan: Vercel (app) + Neon Postgres (published days) + nightly publish job                                                                                                    |

## Pipeline

| Stage                     | Built                                  | Command                                     | ADR                                                      |
| ------------------------- | -------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| 1. Harvest DYK hooks      | ✅                                     | `pnpm harvest` (free)                       | —                                                        |
| 2. Reword + entailment    | ✅                                     | `pnpm reword`                               | [0006](adr/0006-reword-stage-design.md)                  |
| 2b. Fun ranking           | ✅                                     | `pnpm rank-truths`                          | [0009](adr/0009-fun-selection-and-plausibility-floor.md) |
| 3. Generate lies          | ✅                                     | `pnpm generate-lies`                        | [0008](adr/0008-generate-lies-and-gate-2.md)             |
| 4. Verify lies            | ✅                                     | `pnpm verify` (also the golden-set eval)    | [0007](adr/0007-verify-stage-design.md)                  |
| 5. Assemble rounds        | ✅                                     | `pnpm assemble`                             | [0011](adr/0011-assemble-stage-design.md)                |
| 6. Dedupe                 | ❌                                     | —                                           | —                                                        |
| 7. Human review + publish | ❌ (rating page exists: `pnpm rating`) | —                                           | —                                                        |
| Content filter            | ✅                                     | runs inside stages 2, 3 and the rating page | [0010](adr/0010-hard-content-filter.md)                  |

## Measurements so far

| Measure                                   | Latest                                                   | Target                    |
| ----------------------------------------- | -------------------------------------------------------- | ------------------------- |
| False-lie rate (golden set, 22 truths)    | **0%**                                                   | 0%                        |
| Rounds with a usable lie (gate 2)         | 3 / 3                                                    | all                       |
| Lies passing the believability floor (3+) | 64% (was 30%)                                            | —                         |
| Model vs human believability              | within 0.1 points                                        | —                         |
| Cost per round (truths + lies + verify)   | about $0.15                                              | under $0.50               |
| Truth yield (candidates → accepted)       | **9%** (13 / 150)                                        | higher; see open problems |
| Fun ranker vs human                       | 3 of its 5 "great" rated great; missed 2 of 5 favourites | —                         |
| Claude spend to date                      | about $4                                                 | —                         |

## Open problems

1. **Category coverage.** A day needs History, Science & Nature, Geography & Places, Sports &
   Games and Arts & Entertainment, in that order. DYK gives mostly History, and no Geography
   round has been made yet.
2. **Truth yield is 9%.** The surprise gate in stage 2 rejects most drafts, and the ranker now
   does the choosing. Loosen it.
3. **Predicted difficulty is a placeholder.** The Haiku spotter is noisy, so real fool rates
   must replace it.
4. **No day assembly or review step** to fill `bank/`.

## Roadmap to a prototype

1. **Hosting** _(in progress)_: Neon Postgres content source, migrations, publish job,
   Vercel project.
2. **Content:** loosen the yield gate, add category-aware harvesting, a review page, day
   assembly, and about 7 real days.
3. **Game:** play all 5 rounds (tap and keys, then swipe), reveal, results, share, local
   streaks.

## Waiting on Andy

- Rate `fibble-content/out/rate-v4.html` (27 statements, with "Not OK" and two questions).
- Create the hosting accounts when the hosting PR asks (Neon, Vercel).
- Decide whether the prototype must keep the fixed category order.
- Trademark search for "Fibble" (PRD risk, still open).
