# ADR 0007: Stage 4 (verify the lie is false) design

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

A "lie" that is actually true is the worst failure Fibble can have: the game would tell
players a true fact is false. The PRD's gate 2 asks whether we can reliably make lies that
pass verification. That requires a verifier we have measured, not one we trust.

## Decision

For each lie:

1. **Plausibility (Sonnet 5.5), from the statement alone.** The first version rated it inside
   the judge call, after the evidence. Lies that the evidence contradicted then got low
   scores, so evidence leaked into a question that is meant to be about the wording.
2. **Search queries (Haiku 5.5).** The generator never writes its own verification queries.
3. **Retrieval.**
   - **Wikipedia (CirrusSearch):** each hit becomes the article's lead plus **the section that
     best matches the lie**. With introductions only, the first golden-set run passed 3 of 22
     known truths as lies, because their facts sit deep in the article body.
   - **Tavily web search**, excluding Wikipedia.
   - Up to 10 items, de-duplicated by URL, are stored with the verdict.
4. **The judge (Sonnet 5.5, `high` effort)** is a different model from the Opus generator. It
   labels the lie `supported`, `contradicted` or `no-evidence` and cites the evidence it used.
   The prompt says that when evidence partly supports the claim, it should lean towards
   `supported`.
5. **The pass rule** is the PRD's: not `supported`, and plausibility 3 or more. **Anything
   that goes wrong fails closed.** No evidence retrieved (searching found nothing, so it
   proves nothing), a refused judge, or a missing plausibility rating all mean no pass.

**Measuring it:** `pnpm verify --golden` runs a labeled golden set and reports the
**false-lie rate** (truths that pass as lies; the target is 0) and **lie recall**. Golden
sets live in the private repo, because their truths are unreleased puzzle material.

## Consequences

- Golden-v1 (22 truths, 20 hand-written lies): the false-lie rate went from 13.6% with
  introduction-only retrieval to **0%** with section passages. All four near-truth stress
  tests were labeled `contradicted`, and no invented lie was labeled `supported`. One lie was
  wrongly labeled `supported`, which is the safe direction: a wasted lie, not a false one.
- **Open: plausibility calibration.** Even rated blind, the model recognizes true facts and
  doubts invented ones. It scores most hand-written lies 2 and truths 4 to 5, so at the 3+
  floor, lie recall is low. Some of those lies are genuinely weak, so this is measured
  next on Opus-written lies (stage 3) before any change to the floor or the prompt.
- Cost: about $0.014 of Claude per statement, plus up to 3 Tavily searches, which are cached.
