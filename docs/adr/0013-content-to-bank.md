# ADR 0013: From pipeline output to bank days

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

The pipeline made rounds, but nothing put them in `bank/`, the folder the publisher reads.
Three gaps:

- **Category coverage.** DYK is mostly History; no Geography round had been made.
- **Yield.** Stage 2 accepted 9% of candidates.
- **No human approval step.** The PRD requires a person to approve every round before it
  can ship.

Andy confirmed the fixed category order: History, Science & Nature, Geography & Places,
Sports & Games, Arts & Entertainment.

## Decision

1. **A second harvest source: Wikipedia's Unusual articles** (`pnpm harvest --source
unusual-articles --topics …`).
   - Its topic subpages map onto the five categories, and each candidate carries a
     `categoryHint` that stage 2 uses unless the claim clearly belongs elsewhere.
   - Sensitive subpages are never read: Death, Military, Phobias, Religion, and Society,
     economy and law.
   - A blurb on a banned topic is dropped before any article is fetched.
2. **Stage 2's surprise gate drops to 3+.** Verifiability stays at 4+. The fun ranker
   (ADR 0009) now does the choosing.
3. **The hard filter adds sexual content,** after a sample harvest brought in a "Penis Park".
4. **Human review, `pnpm review page|apply`.**
   - It's an offline page, like the rating page, showing each round as played: the
     truths with their reveal and source, the lie with its note, and the alternate lies.
   - Per round: approve, approve with an alternate lie, or reject with a reason (not OK,
     boring, a truth is wrong, the lie might be true, the lie is too easy, other).
   - `apply` writes the approved rounds and a review-log entry (with reviewer, reasons
     and prompt versions), and refuses to apply the same review twice.
5. **Day assembly, `pnpm build-days`.**
   - It takes one approved round per category in the fixed order and fills the next free
     dates. It never overwrites a day, and never reuses a Wikipedia article already in the
     bank.
   - It rebalances lie positions so each card is the lie equally often across the batch.
   - Puzzles are numbered from the first bank day; there's no launch date yet.
   - Every day passes the publisher's checks before it's written.

## Consequences

- **Every bank day traces to a person's approval,** through the review log and the
  day-to-round mapping.
- **A day needs all five categories.** The weakest category sets how many days a batch
  makes, so harvesting should be planned per category.
- **Puzzle numbers will be recomputed** when a launch date is chosen, before anything is
  public.
