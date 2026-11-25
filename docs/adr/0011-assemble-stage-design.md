# ADR 0011: Stage 5 (assemble rounds) design

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

PRD section 5, stage 5: build each round from two truths and one verified lie, run a
style-spotter test, predict difficulty, and balance where the lie sits. A lie that stands
out by style makes a round trivial, whatever its truth.

## Decision

For each truth pair, every lie that passed verification is scored:

- **Style spotter (Haiku 5.5, `low` effort).** It sees the three statements without sources
  and picks the invented one, 10 times, **in a different shuffled order each time**, so card
  position can't bias it. An answer it can't parse doesn't count; a lie with no counted
  answers is treated as fully detectable.
- **Heuristic flags** (recorded for the reviewer):
  - length more than 20% off the truths' average
  - a number in only some of the cards
  - quotes or an exclamation mark only in the lie
  - hedging words

**The chosen lie** is the most plausible, then the least spotted, then the one with fewest
flags. Any lie found more than 70% of the time (the PRD threshold) is vetoed. Plausibility
leads because it matched a human's believability ratings to within 0.1 points (ADR 0009),
while the spotter's picks did not (below). The other scored lies are kept as alternates for
the reviewer.

**Lie positions** are balanced across the batch (each of cards 1–3 used equally, in a seeded
order). **Predicted difficulty** comes from the spotter's miss rate, until real player data
replaces it. Rounds are written in the shared `Round` schema, so they validate exactly like
bank content.

## Consequences

- First run, on the previous batch's 10 lies (2 rounds): about $0.02 in total. The spotter
  found the lies 51% of the time on average, against 33% for random guessing.
- **The spotter alone is a poor judge.** Ranked by detection, it would have picked lies the
  human rated 2 for believability, and ranked the one lie the human rated 4 near the bottom.
  With 10 samples per lie and a small model, it is noisy. It stays as a veto for obvious
  giveaways.
- Predicted difficulty from the spotter is weak for the same reason. Treat it as a
  placeholder until real fool rates exist.
- Days (five categories in fixed order) aren't assembled yet. The bank needs more than
  History; see ADR 0006.
