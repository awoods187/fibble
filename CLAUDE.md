# CLAUDE.md

Guidance for Claude Code (and humans) working in this repo.

## Project

Fibble is a daily "Two Truths and a Lie" trivia web game: 5 rounds, 3 statements each, find
the fib. Truths are reworded from Wikipedia; lies are written by an LLM, verified by a second
model, and approved by a human. The product requirements live in `docs/PRD.md`, which is
**git-ignored and local only**. Ask Andy for a copy if it's missing; never commit it.

Status: pre-alpha. Week 1 foundations are built. Swipe play, reveals, the database, the PWA
shell and real pipeline calls are not.

## Commands

Run from the repo root (Node 26, pnpm 12):

```bash
pnpm install
pnpm dev                 # web app on http://localhost:3000 (sample content)
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:content    # checks content-example/ against the schema
pnpm build
pnpm format              # Prettier write; CI runs format:check
```

Scope to one package with `pnpm --filter @fibble/web test` (or `@fibble/shared`, `@fibble/pipeline`).

## Folder map

| Path                 | What lives there                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/`          | Next.js App Router game. `src/app/api/` route handlers, `src/lib/content/` ContentSource, `src/lib/puzzle-service.ts` date gate and answer logic |
| `packages/shared/`   | Zod schemas (`schema.ts`), categories, date gating, `toPublicPuzzle`, `buildAnswerResult`, `buildShareText`                                      |
| `packages/pipeline/` | Typed stages (`src/stages/`), `models.ts`, `prompts/example-v1/`, `evals/`, `validate:content`                                                   |
| `tools/review/`      | Placeholder for the local review UI                                                                                                              |
| `content-example/`   | Three sample days, `"sample": true`                                                                                                              |
| `docs/`              | `architecture.md`, `adr/`, `ai-development.md` (and the local-only `PRD.md`)                                                                     |

## Rules

1. **Never commit secrets.** API keys, database URLs and tokens go in `.env.local` (git-ignored)
   or CI/Vercel secrets. `.env.example` holds variable names only.
2. **Never commit real puzzles.** Real and future puzzle data belongs in the private
   `fibble-content` repo. Only `content-example/` (marked `"sample": true`) is public;
   `content/` is git-ignored as a safety net.
3. **The Zod schema is the source of truth.** Types are `z.infer`'d from
   `packages/shared/src/schema.ts`. Don't hand-write parallel interfaces; change the schema
   and let the compiler find every caller.
4. **Every new function gets tests** (Vitest). Pure logic belongs in `packages/shared` with unit tests.
5. **Answers never reach the client before a choice.** Puzzle responses go through
   `toPublicPuzzle` (an allow-list). Never pass a full `Puzzle` to a client component or a
   response. Route handlers go through `getPlayablePuzzle` so the date gate can't be skipped.
   Leak tests in `apps/web/test/` must keep passing.
6. **Respect the date gate.** A date is served only once it has started in UTC+14. Unreleased
   and missing dates return the same 404.
7. **Content rules (PRD section 5):** no living people in lies; never attribute wrongdoing to a
   named real person or company; truths must cite a Wikipedia article and pinned revision ID;
   statements are 80 to 160 characters.
8. **Models:** use the IDs in `packages/pipeline/src/models.ts`; don't hard-code model IDs elsewhere.
9. **Dependencies:** pin new versions in the `catalog:` in `pnpm-workspace.yaml`, and check the
   current version with `npm view <pkg> version` instead of guessing. Ask before adding one.
10. **Git:** work on a branch, never push to `main`, use Conventional Commits
    (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `ci:`), and add a session entry to
    `docs/ai-development.md` for significant LLM-assisted work.
