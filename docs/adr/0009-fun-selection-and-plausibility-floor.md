# ADR 0009: Choose truths by comparison; keep the plausibility floor at 3

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Andy rated 42 statements: 12 accepted truths and 30 Opus lies.

- **The model's plausibility rater was far too harsh.** Andy put all 30 lies at 3 or more; the
  model passed 11. It was 1.7 points lower on average, and never passed a lie Andy didn't.
- **Many facts were boring.** Stage 2 had given all 12 accepted truths a surprise score of
  exactly 4, so the score separated nothing.
- **The lies followed the truths' level.** Opus wrote mild civic quirks, and kept reusing
  settings across rounds (Bruges three times).

## Decision

1. **Fun ranking (`pnpm rank-truths`).** After stage 2, Opus compares truths in shuffled
   batches of 10 and sorts each into `great`, `fine` or `boring`. At most a third of a batch
   may be `great`, and code enforces that cap even if the model ignores it.
   `pnpm generate-lies --min-fun great` writes lies only for the best truths. Comparing beats
   scoring one at a time, because the model has to discriminate.
2. **Lies match the truths' surprise: no less and no more.** The prompt lists the lies
   already accepted in the batch, so rounds don't reuse settings.
3. **The plausibility floor stays at 3** (see the v3 results below). It was briefly lowered
   to 2 on the first ratings, which turned out to be confounded by the mixed scale.
4. **Rating page v2** asks two questions, "Believable?" and "Good for the game?", because one
   scale was read as both. The report compares the ranker's tiers with the human's.

## Results from the two-question page (v3: 16 truths, 10 lies)

|                            | Truths | Lies                       |
| -------------------------- | ------ | -------------------------- |
| Rated "great" for the game | 31%    | 90%                        |
| Believability (1–5)        | 3.6    | 2.3 (8 of 10 "I doubt it") |

- **The first "match the wow" prompt overshot.** The lies became the most exciting _and_ the
  least believable card in each round, which makes them easy to spot. The rule now says
  "no less, and no more", and prefers the more believable version.
- **On a clean scale, the model's plausibility matched the human to within 0.1 points.** The
  earlier "1.7 points too harsh" came mostly from the mixed scale. A floor of 3 rejects
  exactly the lies the human doubted, so it stays at 3.
- **The ranker is fair at the top but undersells.** 3 of its 5 "great" picks were rated great
  and none boring, but it ranked 2 of the human's 5 favourites "boring". Until there's more
  data, lie generation uses great and fine truths (`--min-fun fine`, the default) and drops
  only the boring ones.
- **Next, in stage 5:** each round should use the lie whose believability is closest to its
  truths'.

## Consequences

- A fresh batch (Feb–Mar 2024): 120 candidates gave 16 truths, ranked 5 great, 5 fine and 6
  boring. That made 2 rounds and 10 lies, all of which passed verification with none
  secretly true, at about $0.17 per round.
- Whether the ranker's `great` matches a human's is measured with page v3.
- Stage 2 rejects many drafts on its surprise score (54 of 120) yet doesn't discriminate
  among the ones it accepts. If the ranker proves reliable, loosen that gate and let the
  ranker choose.
