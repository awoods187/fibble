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

### What went wrong

The first CI run failed. The `.gitignore` rule `content/`, meant for real puzzle data at the
repo root, also matched `apps/web/src/lib/content/`, so the ContentSource module was never
committed. Local checks passed because the files existed on disk. The fix was anchoring the
rule to `/content/`, and the habit is to run the full check from a **fresh clone** before
pushing.

### Lessons

- **A plan-first gate is cheap and catches real problems.** Three of the four issues above
  surfaced during planning, before any code existed.
- **Check versions, don't remember them.** Using the newest version of everything would have
  broken linting.
- **Make answer-leak tests structural.** The tests walk every key of the API response and
  search the raw JSON for source URLs, instead of checking a few known fields.
- **Verify from a fresh clone, not the working tree.** A passing local build proves nothing
  about files git is silently ignoring.

---

## Session 2 (2026-11-25): Credentials, search choice and pipeline stage 1 (harvest)

**Model:** Claude Opus 5.5 in Claude Code.
**Branch:** `feat/pipeline-harvest`.

### What happened

1. **Credentials without keys.** The plan was to create Anthropic API keys and store them as
   secrets. The Console offered keyless options instead, so Claude switched the plan: `ant auth
login` locally, workload identity federation for CI. Claude verified the login with
   `ant auth status` and a free `models list` call rather than taking it on trust.
2. **Search API.** Claude laid out three options (Claude's built-in web search, Brave, Tavily)
   with a recommendation; Andy chose Tavily. Claude checked the key with one test search
   without printing it. Recorded in ADR 0005.
3. **Harvest.** Claude fetched one real DYK archive month before planning and found the PRD's
   page name (`Wikipedia:Recent additions`) is now a redirect to `Wikipedia:Did you know
archive/YYYY/Month`. Plan approved as proposed, then built: parser, context picker,
   living-person check, a polite cached API client, and a CLI.

### Checking the output, not just the tests

A real run over May 2024 gave 275 candidates from 276 hooks (one had no bold subject), with
72 flagged for living people. Spot checks:

- Richard Osman was flagged on a hook whose subject was a different article, which is the
  reason the check covers every linked person, not just the subject.
- Samuel Kummer, a modern organist, was **not** flagged. That looked like a bug; Wikidata
  records his death in April 2024, so the check was right.
- A re-run made 0 requests (318 cache hits).

### Delegated vs. hand-written

| Area                            | Who                                |
| ------------------------------- | ---------------------------------- |
| Search vendor, auth approach    | Andy, from options Claude laid out |
| Console and GitHub secret setup | Andy (Claude never saw a key)      |
| Harvest code, tests, docs, ADR  | Claude, reviewed by Andy in the PR |

### Lessons

- **Look at the real data before planning a parser.** One request found the renamed archive
  pages and the exact hook format; the fixtures were then written to match it.
- **Investigate a surprising "pass" as hard as a failure.** The unflagged organist was correct,
  but it was worth the two requests to know.
