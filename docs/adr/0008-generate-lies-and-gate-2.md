# ADR 0008: Stage 3 (generate lies) and the first gate 2 result

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Gate 2 in the PRD's build plan asks whether the pipeline can reliably make lies that pass
verification. If it can't, week 4 goes to prompts and verification instead of the game
client. Stage 4 was built and measured first (ADR 0007).

## Decision

- **Pairing:** truths are paired within a category, in order.
- **Generation:** Opus 5.5 at `high` effort writes 5 lies per pair, with the example prompt,
  as structured output: `text`, `lieNote`, and `borrowedTexture` for the reviewer.
- **Free code checks** before verification:
  - 80–160 characters, and within 15% of the truths' average length
  - no hedging; the lie note is one sentence
  - no naming either truth's entities, and no copying a 5-word run from a truth
  - a number if both truths have one
  - near-duplicates among the 5 are dropped
- **`pnpm generate-lies --verify`** sends survivors straight to stage 4, under **one budget
  for both stages**. It writes a gate 2 report covering usable rounds, the pass funnel,
  "lies" found true, plausibility, and cost per round, including the truths' stage 2 cost.

## Consequences

First run: 6 truth pairs from May 2024 DYK (5 History, 1 Arts & Entertainment), production
prompts copied from example-v1.

| Measure                              | Result                           |
| ------------------------------------ | -------------------------------- |
| Rounds with at least one passing lie | 6 / 6                            |
| Lies: generated → checks → verified  | 30 → 30 → 11                     |
| Generated lies the judge found true  | 0                                |
| Plausibility of the 30               | 2: 19 · 3: 8 · 4: 3              |
| Cost per round                       | about $0.15 (target under $0.50) |

**Gate 2 passes provisionally.** Every round got a usable lie, none was secretly true, and
the cost is about a third of the budget. The caveats:

- **The sample is small and skews to History.** More categories need more sources (ADR 0006).
- **Plausibility is uncalibrated.** The blind rater scores most invented lies 2, including
  some that read as believable. **Next step: human ratings** of a sample, to set the floor
  or re-prompt the rater against real judgments, not model guesses.
- **Every generated lie was judged `no-evidence`.** For invented claims, safety rests on
  retrieval finding the truth when there is one, which the golden-set false-lie rate (0%)
  measures.
- **Opus reuses settings across rounds** (Bruges, umbrella lenders, the Paris Observatory),
  so stage 5/6 need cross-round diversity checks.
- **The code checks rejected none of the 30.** They are cheap insurance, so they stay.
