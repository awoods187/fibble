# Building Fibble with Claude Code

A running log of how this repo is built with [Claude Code](https://claude.com/claude-code):
what was delegated, what a human decided, and what we learned. One entry per working session,
newest last.

---

## Session 1 (2026-11-24): Week 1 foundations

**Model:** Claude Opus 5.5 in Claude Code.
**Branch:** `setup/foundations`.

### The brief

Andy wrote a detailed prompt for the Week 1 "Foundations" milestone: monorepo tooling, the
shared puzzle schema, sample content, a minimal web app rendering one round, a pipeline
skeleton, CI and docs. It came with explicit rules: read the PRD first, propose a plan and
wait for approval, work on a branch, use Conventional Commits, check package versions with
`npm view`, add no dependencies without asking, and create no cloud resources.

### How the session ran

1. **Explore and plan.** Claude read the full PRD and the repo, checked current versions with
   `npm view`, and came back with a file tree, a version table and open questions before
   writing any code.
2. **Human decisions.** Andy answered the open questions:
   - Keep the PRD **out of git** (it is git-ignored and lives only locally at `docs/PRD.md`).
   - Use **real, verified truths** for sample day 1 and placeholders for days 2 and 3.
   - Implement the PRD's "refuse dates more than 1 day old" rule behind an archive flag.
   - Approve the extra dev dependencies (`typescript-eslint`, `eslint-config-next`, `tsx`, types).
3. **Build.** Claude wrote the code in small commits: tooling, shared schemas with tests, sample
   content, pipeline skeleton, web app, web tests, CI, docs.
4. **Verify.** Claude ran lint, typecheck, tests, content validation and a production build
   locally, started the dev server, called the API with curl, and took headless Chrome
   screenshots to check the cards rendered in the black-and-silver style.

### What Claude caught that the brief didn't say

- **Conflicts with the PRD.** The PRD was at the repo root under a different name, not at
  `docs/PRD.md`. The PRD's API also refuses dates more than a day old, which the brief left out.
- **Version incompatibility.** The newest TypeScript (7.0.2) isn't supported by
  `typescript-eslint` 8.74, which allows up to 6.0. Pinned TypeScript 6.0.3 and recorded why in ADR 0001.
- **Schema versus placeholders.** Statements must be 80 to 160 characters, so a placeholder
  like `[SAMPLE] History truth 1` would fail validation. Placeholders are padded to a realistic length.
- **Toolchain gaps.** Node 25 no longer ships corepack, and pnpm 12 blocks dependency build
  scripts by default, so `esbuild` (used by `tsx`) had to be explicitly allowed.

### Fact-checking the sample truths

Each of the 10 truths in `content-example/2026-11-24.json` was checked against its Wikipedia
article through the MediaWiki API: the latest revision ID was pinned, and the article text
was searched for the specific claim (dates, numbers, names) before the truth was written. One
claim was softened during checking: the article says the popular story of the Mona Lisa
hidden under a smock is disputed, so that truth says only that the thief blended in with staff
by wearing a work smock.

The lies were written by Claude to follow the rules in the example lie-generation prompt:
fully invented, no living people, different topic from the round's truths, matched length.
They have **not** been through an automated verification stage, because that stage doesn't
exist yet.

### Delegated vs. hand-written

| Area                                                                | Who                                        |
| ------------------------------------------------------------------- | ------------------------------------------ |
| Product requirements, scope, rules of the brief                     | Andy                                       |
| Open-question decisions (PRD privacy, sample content, archive rule) | Andy                                       |
| Code, tests, configs, docs, commit messages                         | Claude, reviewed by Andy in the PR         |
| Fact-checking sample truths                                         | Claude, against pinned Wikipedia revisions |

### Lessons

- **A plan-first gate is cheap and catches real problems.** Three of the four issues above
  surfaced during planning, before any code existed.
- **Check versions, don't remember them.** Using the newest version of everything would have
  broken linting.
- **Make answer-leak tests structural.** The tests walk every key of the API response and
  search the raw JSON for source URLs, instead of checking a few known fields.
