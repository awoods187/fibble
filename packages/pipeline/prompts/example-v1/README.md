# Example prompts (v1)

These prompts show the **shape** of each pipeline prompt. They are written to be
read and are not the production prompts. Production prompts live in the private
`fibble-content` repo under `prompts/production/` and are versioned there.

| File               | Stage                            | Model (see `src/models.ts`) | Status                             |
| ------------------ | -------------------------------- | --------------------------- | ---------------------------------- |
| `generate-lies.md` | 3. Generate lies                 | `claude-opus-5-5`           | Full example                       |
| `reword.md`        | 2. Select and reword             | `claude-haiku-5-5` (draft)  | Full example                       |
| `entailment.md`    | 2. Entailment check              | `claude-opus-5-5`           | Full example                       |
| `verify-judge.md`  | 4. Verify the lie is false       | `claude-sonnet-5-5`         | Stub                               |
| `style-spotter.md` | 5. Style-spotter test            | `claude-haiku-5-5`          | Stub                               |
| `classify.md`      | 1–2. Category and entity tagging | `claude-haiku-5-5`          | Folded into `reword.md` (ADR 0006) |

Template variables use `{{double_braces}}`. Shared rules (the style spec) sit at the top of
each prompt so they can be cached with prompt caching.
