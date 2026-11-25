# ADR 0006: Stage 2 (select and reword) design

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Stage 2 turns harvested "Did you know" hooks into true statements for the game (PRD section
5). It is the first stage that spends money, and the most costly failure in the game is a
"truth" that is wrong. ADR 0004 planned a separate Haiku classification call and the Message
Batches API for every call.

## Decision

1. **Free checks before paid ones.** For each candidate:
   1. The living-person flag from harvest rejects it, with no model call.
   2. Haiku drafts the statement, the reveal, a verbatim supporting sentence, the category,
      the entities, the scores and the content flags, as one structured-output call.
   3. Code checks run next:
      - length and hedging words
      - scores of 4 or more, and no content flags
      - the supporting sentence must appear verbatim in the evidence
      - a copy check: at most 7 consecutive words shared with the source, per the PRD
        licensing plan
   4. Only drafts that pass reach Opus.
2. **Entailment on Opus 5.5 at `high` effort**, covering both the statement and the reveal.
   Anything not fully supported is rejected, never repaired. The server-side refusal fallback
   is on for Opus calls; any refusal is a rejection.
3. **Classification is part of the draft call**, not a separate Haiku call: one call per
   candidate instead of two. The `classify` model entry stays for later reuse.
4. **One call at a time for now**, not the Batches API. Batch results can take minutes to hours,
   which slows prompt tuning. Batch mode, at half the price, follows once the prompts settle.
5. **A hard budget.** `--budget` (default $1) stops starting new candidates once estimated
   spend reaches it. Every record carries its calls' token usage and estimated cost.
6. **Prompts are files, chosen per run.** `prompts/example-v1/` is public; the private repo
   passes `prompts/production/<version>/`.

## Consequences

- The first real run (60 May 2024 candidates) accepted 12 for $0.19 in total, about $0.016
  per accepted truth, far under the PRD's $0.30 to $0.50 per round.
- The yield is about 28% of eligible candidates. Most rejections were low surprise scores
  and copy-check failures, so those are the first things to tune in the production prompt.
- DYK skews towards History (10 of 12 accepted). Filling five categories a day will need
  category-aware harvesting or more sources, which is a stage 5 concern.
