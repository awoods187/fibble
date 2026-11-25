# ADR 0009: Choose truths by comparison, and lower the plausibility floor

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
2. **Lies match the wow.** The prompt now says a lie must compete with the truths, not just
   copy their style, and lists the lies already accepted in the batch so it doesn't reuse
   their settings.
3. **The plausibility floor is 2.** Only "obviously made up" fails. The PRD proposed 3, but the
   model's 2 matched a human 4. The score stays on each verdict for ranking lies.
4. **Rating page v2** asks two questions, "Believable?" and "Good for the game?", because one
   scale was read as both. The report compares the ranker's tiers with the human's.

## Consequences

- A fresh batch (Feb–Mar 2024): 120 candidates gave 16 truths, ranked 5 great, 5 fine and 6
  boring. That made 2 rounds and 10 lies, all of which passed verification with none
  secretly true, at about $0.17 per round.
- Whether the ranker's `great` matches a human's is measured with page v3.
- Stage 2 rejects many drafts on its surprise score (54 of 120) yet doesn't discriminate
  among the ones it accepts. If the ranker proves reliable, loosen that gate and let the
  ranker choose.
