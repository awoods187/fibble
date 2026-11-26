# Project status

The single place to see where Fibble is. **Update it in every PR that changes the picture.**
Numbers only: real truths, lies and rounds stay in the private `fibble-content` repo.

_Last updated: 2026-11-25 (game feel G2 PR)._

## Where we are

**Phase:** private launch, **2026-11-25 = Fibble #1**. The pipeline runs from Wikipedia to bank
days (stages 1–5, review, day assembly).
The game plays a full day by swipe, tap, keys or list view, with motion and haptics (G1, G2). Hosting is built but waiting on Vercel.
Next: the PWA and About page (G3), and the first real days (a paid batch plus Andy's review).

| Area               | State                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repos              | `fibble` (public, `main` protected, CI required) · `fibble-content` (private, honor-system merges on GitHub Free)                                                                             |
| Security           | Keyless Claude auth; secret scanning (GitHub on public, `check:secrets` + pre-commit hook on private); SHA-pinned actions; security headers; banned-topic filter ([security.md](security.md)) |
| Web app            | Plays a full day: splash and how-to, 5 rounds (swipe, tap, keys 1–3/T/L, list view), flip reveal, results, share, local streaks, resume, haptics                                              |
| Content in `bank/` | **None yet.** No day has been assembled or reviewed                                                                                                                                           |
| Hosting            | Neon ready (roles checked); app reads it when `DATABASE_URL` is set (ADR 0012). **Vercel blocked:** the account email needs Vercel support                                                    |

## Pipeline

| Stage                  | Built    | Command                                                             | ADR                                                      |
| ---------------------- | -------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| 1. Harvest             | ✅       | `pnpm harvest` (free): DYK, or Unusual articles by topic            | [0013](adr/0013-content-to-bank.md)                      |
| 2. Reword + entailment | ✅       | `pnpm reword`                                                       | [0006](adr/0006-reword-stage-design.md)                  |
| 2b. Fun ranking        | ✅       | `pnpm rank-truths`                                                  | [0009](adr/0009-fun-selection-and-plausibility-floor.md) |
| 3. Generate lies       | ✅       | `pnpm generate-lies`                                                | [0008](adr/0008-generate-lies-and-gate-2.md)             |
| 4. Verify lies         | ✅       | `pnpm verify` (also the golden-set eval)                            | [0007](adr/0007-verify-stage-design.md)                  |
| 5. Assemble rounds     | ✅       | `pnpm assemble`                                                     | [0011](adr/0011-assemble-stage-design.md)                |
| 6. Dedupe              | ✅ basic | inside `build-days`: no reused article, no near-duplicate statement | [0013](adr/0013-content-to-bank.md)                      |
| 7. Human review        | ✅       | `pnpm review page`, then `pnpm review apply`                        | [0013](adr/0013-content-to-bank.md)                      |
| Day assembly           | ✅       | `pnpm build-days`                                                   | [0013](adr/0013-content-to-bank.md)                      |
| Publish                | ✅       | `pnpm publish-days`                                                 | [0012](adr/0012-hosting-vercel-neon.md)                  |
| Content filter         | ✅       | runs inside stages 2, 3 and the rating page                         | [0010](adr/0010-hard-content-filter.md)                  |

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

1. **Category coverage:** addressed by the Unusual-articles source; not yet measured at scale.
2. **Truth yield was 9%:** the surprise gate is now 3+; to be measured in the next batch.
3. **Predicted difficulty is a placeholder.** The Haiku spotter is noisy, so real fool rates
   must replace it.
4. **Vercel is blocked** on an account email change (support ticket open).

## Roadmap to a prototype

1. **Content** _(code done)_: a paid batch of about 35 rounds (7 per category, capped at $15),
   Andy reviews them, then `build-days` writes about 7 days to `bank/`.
2. **Hosting** _(built)_: finish the Vercel setup once support replies, then the smoke test.
3. **Game:** G1 (play loop) and G2 (swipes, motion, haptics) done. G3: PWA and About page.

## Waiting on Andy

- Approve the content batch budget ($15 cap), then review about 40 rounds on the review page.
- Vercel support: change the account email, then import the project (docs/hosting.md § 3).
- Rate `fibble-content/out/rate-v4.html` (optional now that the review page exists).
- Trademark search for "Fibble" (PRD risk, still open).
