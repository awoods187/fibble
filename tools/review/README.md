# Review UI (placeholder)

A local web UI for **stage 7, human review** (PRD section 5, requirement F14). It is not built yet.

Planned behavior:

- Show each candidate round with its sources, entailment and verification results, the style-spotter score and any heuristic flags.
- Let the reviewer **approve**, **edit** (edits re-run stages 2 to 5) or **reject** each round.
- Write approved days into the private `fibble-content` repo as `bank/YYYY-MM-DD.json`, validated against the `@fibble/shared` schema, with a `review-log/` entry recording who approved what, when, and with which prompt version.

It runs only on a reviewer's machine and is never deployed.
