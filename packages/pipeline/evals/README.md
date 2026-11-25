# Pipeline evals

The eval suite measures whether the pipeline makes good, correct rounds. Its
published numbers are part of the README's "How we know they're good" section
(PRD section 6). **Status:** the stage 4 runner is built (`pnpm verify --golden <file>`); the others aren't yet.

## What we measure

| Metric                 | Question it answers                                                      | Stage       |
| ---------------------- | ------------------------------------------------------------------------ | ----------- |
| False-lie rate         | How often does the judge pass a "lie" that is actually true?             | 4. Verify   |
| Lie recall             | How often does the judge correctly reject a known truth posing as a lie? | 4. Verify   |
| Entailment accuracy    | Does the entailment check catch rewrites the source doesn't support?     | 2. Reword   |
| Spotter detection rate | How often does the style spotter find the lie by style alone?            | 5. Assemble |
| Cost per round         | LLM and search spend per published round (target under $0.50)            | All         |

The false-lie rate matters most: a true "lie" is the worst failure in the game (PRD section 10).

## Golden-set format

A golden set is a JSON file holding a list of hand-labeled statements: known truths and
known lies, each with the label the pipeline is expected to produce. See
[`golden-set.example.json`](./golden-set.example.json).

```jsonc
{
  "version": "example-v1",
  "items": [
    {
      "id": "truth-emu-war",
      "category": "History",
      "text": "In 1932, the Australian Army sent soldiers armed with Lewis machine guns ...",
      "expected": "truth", // "truth" | "lie"
      "expectedJudgeLabel": "supported", // what stage 4 should say: supported | contradicted | no-evidence
      "source": {
        // required for truths, omitted for lies
        "title": "Emu War",
        "url": "https://en.wikipedia.org/wiki/Emu_War",
        "revisionId": 1386571001,
      },
      "notes": "Why this item is in the set (edge case, past failure, etc.)",
    },
  ],
}
```

Field rules:

- `expected: "truth"` items must have a `source` with a pinned `revisionId`, and
  `expectedJudgeLabel` is `"supported"`.
- `expected: "lie"` items have no `source`. `expectedJudgeLabel` is `"contradicted"` or
  `"no-evidence"`; either one passes.
- Include **tricky truths** (real facts that sound invented) and **near-miss lies** (one-detail
  edits of real facts, which the generator must never produce but the judge must still catch).
- Golden items are never used as live puzzle content.

## Running (planned)

```bash
pnpm --filter @fibble/pipeline eval --set evals/golden-set.example.json
```

The runner will send each item through the stage under test, compare the result with
`expected` and `expectedJudgeLabel`, and write a dated report under `evals/reports/`.
It will use the Message Batches API and will never run in CI by default, because it spends
money. Real golden sets live in the private content repo.
