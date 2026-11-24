# ADR 0004: A different Claude model per pipeline stage

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

The pipeline mixes hard creative work (writing believable lies), careful judgment (checking a
lie is false against evidence), and high-volume, low-stakes tasks (tagging, a 10-sample style
test). The worst failure is a "lie" that is actually true, and a model is poorly placed to
catch its own blind spots.

## Decision

Pick the model per stage, configured in `packages/pipeline/src/models.ts`:

| Stage                                           | Model               | Why                                                                         |
| ----------------------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| Lie generation, entailment check                | `claude-opus-5-5`   | Hardest creative and judgment work; quality matters most                    |
| Lie verification judge                          | `claude-sonnet-5-5` | A **different** model from the generator, reasoning over retrieved evidence |
| Classification, rewording drafts, style spotter | `claude-haiku-5-5`  | High volume, low stakes, very cheap                                         |

All calls go through the Message Batches API with prompt caching on the shared style spec.

## Consequences

- The generator and the judge don't share one model's blind spots, though they share a model
  family. Adding a non-Anthropic judge is an open question in the PRD.
- Cost stays near the PRD estimate of $0.30 to $0.50 per published round, to be measured in
  the first real batch.
- Model IDs live in one file, so upgrading a stage is a one-line change plus an eval run.
