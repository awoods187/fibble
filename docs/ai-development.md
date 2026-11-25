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

---

## Session 3 (2026-11-25): Dependabot, branch rules and a security pass

**Model:** Claude Opus 5.5 in Claude Code.
**Branches:** `ci/dependabot-and-checks`, `security/hardening`.

### What happened

1. **Dependabot and PR hygiene**, modelled on `andy-website`: grouped weekly updates,
   CODEOWNERS and a PR template. Claude adapted rather than copied: a 3-day cooldown to
   match pnpm's minimum release age, Next and React grouped, no `reviewers` key.
2. **Security audit before stage 2.** Claude checked:
   - every commit in both repos for key patterns (none found)
   - the repo settings, collaborators, deploy keys, webhooks and Actions permissions
   - the workflow triggers
   - how the web app uses env vars and validates input

   That produced a short list of real gaps.

3. **Andy's decisions:** both kinds of agent files (AGENTS.md plus Claude Code deny rules,
   and robots/ai/llms.txt), with AI training crawlers blocked.
4. **Fixes:** a dependency-free secret scanner run on the repo and the built bundle, leak
   tests, security headers, a body-size limit, SHA-pinned actions, and docs/security.md.

### What went wrong

The scanner's first version flagged an empty `SEARCH_API_KEY=` line. With the regex `m`
flag, `\s*` after `=` ran on into the next line and matched the variable there. A test of
allowed values caught it before it ever ran in CI.

### Lessons

- **Say what can't be done.** "Only we can use the API" isn't possible for a browser game.
  The honest answer is a list of what is protected and what is still open, in
  `docs/security.md`.
- **Robots files are requests, not controls.** They're worth having, but rate limiting at
  the edge is what enforces them.

---

## Session 4 (2026-11-25): Pipeline stage 2 (select and reword)

**Model:** Claude Opus 5.5 in Claude Code.
**Branch:** `feat/pipeline-reword`.

### What happened

Claude planned the stage, including two changes from ADR 0004 (classification folded into
the draft, and one call at a time instead of batches) and a $2 cap for the first run. Andy
approved it as proposed. Claude then built:

- the prompts
- a Claude client with structured outputs, cost tracking and a budget
- free code checks, and the Opus entailment check
- a CLI with `--dry-run`

Tests use a fake client; no test calls the API.

### The first real run

60 May 2024 candidates, run locally with keyless auth, output to `fibble-content/out/`:

| Step                                   | Count |
| -------------------------------------- | ----- |
| Filtered for living people (free)      | 17    |
| Rejected by code checks after drafting | 29    |
| Rejected by entailment                 | 2     |
| **Accepted**                           | 12    |

Total cost: **$0.19**, about $0.016 per accepted truth. Haiku made 43 calls for $0.03; Opus
made 14 calls for $0.15.

What the numbers show:

- **Entailment is strict, as intended.** Both rejections were real but small differences:
  "usually" where the source said "often", and "completed" where it said "designed".
- **Low surprise scores** caused 22 rejections, and **the copy check** caused 9 (8 to 12
  shared words). Those are the production prompt's first tuning targets.
- **10 of 12 accepted truths were History.** The DYK source alone won't fill five categories
  a day.

### Checking a surprising pass, again

Two hooks naming apparently modern people got past the living-person filter. Wikidata records
both as having died (2024 and 2017), so the filter was right.

### Lessons

- **Make the cheap checks first.** The verbatim supporting-sentence and copy checks cost
  nothing and stopped 29 drafts before any Opus call.
- **Keep private output out of public logs.** The real statements stay in the private repo;
  this log and the PR hold only counts.

---

## Session 5 (2026-11-25): Stage 4 (verify) and the first golden-set eval

**Model:** Claude Opus 5.5 in Claude Code.
**Branch:** `feat/pipeline-verify`.

### What happened

Andy approved a plan to build verification before lie generation, so the judge could be
measured before it is trusted. Claude built:

- Tavily search, with plain `fetch` and a disk cache
- Wikipedia search on the existing polite client
- query writing, the judge, and the fail-closed pass rule
- a golden-set eval runner

It also wrote a private starter golden set: 22 truths and 20 invented lies, including four
near-truth stress tests. The lies need Andy's review.

### Measure, fix, measure again

| Run | Change                                                     | False-lie rate | Cost  |
| --- | ---------------------------------------------------------- | -------------- | ----- |
| v1  | Search returned article introductions only                 | 13.6% (3/22)   | $0.44 |
| v2  | Article section matching the lie; plausibility rated blind | **0%** (0/22)  | $0.58 |

All three v1 misses had the same cause: the fact lived deep in the article, so the judge
honestly saw "no evidence", and no-evidence passes. The fix was in retrieval, not the judge.

### What's still open

Plausibility. Rated after the evidence, it was biased by the evidence. Rated blind, the model
still recognizes true facts and doubts invented ones, so most hand-written lies scored 2.
A calibrated prompt helped only at the margins. Claude stopped tuning against its own lies:
the real test is Opus-written lies in stage 3.

### Lessons

- **A golden set pays for itself on its first run.** Without it, the shallow retrieval would
  have shipped, with a 1-in-7 chance of telling players a true fact was false.
- **Writing lies is hard to get right.** While drafting the golden set, several "invented"
  facts turned out to be true (rooftop bees at the Paris Opéra, Satie's identical suits).
- **Don't tune a metric against data you wrote yourself.**

---

## Session 6 (2026-11-25): Stage 3 (generate lies) and gate 2

**Model:** Claude Opus 5.5 in Claude Code.
**Branch:** `feat/pipeline-generate-lies`.

Claude built stage 3 as planned: Opus writes 5 lies per truth pair, then free code checks,
then straight into stage 4 under one budget, with a gate 2 report. On the first run, all 6
rounds got a usable lie, no generated lie was secretly true, and a round cost about $0.15.
Details are in ADR 0008.

Before that, a dry run in the private repo showed its production prompt folder had no stage 4
prompts, so `pnpm verify` there would have failed. The fix went into the open pinned-version
PR. A dry run costs nothing and caught a real gap.

### Lessons

- **A believable lie is a human judgment.** Two rounds of prompt changes didn't stop the model
  rater from preferring facts it recognizes. The honest next step is human labels.
- **Watch for repeats across calls, not just within one.** Each set of 5 lies was varied, but
  across rounds Opus kept returning to the same towns and props.

---

## Session 7 (2026-11-25): A human rating page for plausibility

**Model:** Claude Opus 5.5 in Claude Code.
**Branch:** `feat/rating-page`.

The model's plausibility rater scored most invented lies 2 out of 5 (ADR 0008), so Andy asked
for a page to rate them himself. The design choices:

- **It's a local file, not a hosted page.** It shows unreleased truths and lies, and the
  private repo's rule is that its content never goes to an outside service. It is one
  self-contained HTML file with a CSP that blocks all network requests, and progress saves
  in the browser.
- **It's blind.** Truths and lies are shuffled and given opaque ids. The answer key is a
  separate file. A test checks that the page never contains "truth", "lie" or a source id.
- **"I already knew" is a checkbox.** Recognising a fact is exactly the bias the model rater
  has, so those ratings are left out of the comparison.
- **`pnpm rating report`** compares the human ratings with the model's, lie by lie.

Claude checked the built page in headless Chrome: it renders, has 5 options, and its script
runs. A unit test can't show that.

### What went wrong

The file-writing tool turned the ` ` escapes in a regular expression into literal
line-separator characters, which broke the parse. Typecheck caught it, and a short script
restored the escapes.

### Follow-up: the first ratings, and page v2

Andy rated all 42 statements and said the scale was confusing: he picked "surprising but
believable" when a statement would fit the game, and found many facts boring either way. So
v1 measured "fits the game" more than believability. Even so, two findings were clear:

- **The model's plausibility rater is far too harsh.** Andy put all 30 lies at 3 or more; the
  model passed 11. It was 1.7 points lower on average, and never passed a lie Andy didn't.
- **"Is it fun?" is the missing measure.** Stage 2 gave all 12 accepted truths a surprise
  score of exactly 4, so the score doesn't separate anything.

Page v2 asks two separate questions: **Believable?** (1–5, only "does it sound true") and
**Good for the game?** (boring, fine, great). The report shows both. The lesson: one scale
can't answer two questions, and a rater will answer the one they care about.

---

## Session 8 (2026-11-25): Choosing for fun, and a hard content filter

**Model:** Claude Opus 5.5 in Claude Code.
**Branch:** `feat/fun-selection`.

Acting on Andy's ratings, Claude added:

- fun ranking by comparison
- a "match the wow" rule and an avoid list for lies
- a plausibility floor of 2

A fresh batch went through every stage and onto a rating page (ADR 0009).

### A miss that mattered

Andy found a card about a school's Nazi-themed parade. Every safeguard had depended on a model
noticing, and none did:

- Haiku's flags didn't name extremism.
- Its politics flag covered only 30 years.
- The fun ranker called it "fine".
- The page had no "not OK" option.

The fix is a code-level filter for extremism, atrocities and racism at every stage, plus
broader model flags and a "Not OK" button. The test suite includes a statement shaped like
the one that got through (ADR 0010).

### Lessons

- **Layer safeguards that fail in different ways.** Three model checks missed it for the same
  underlying reason: none was asked about the topic. A keyword list is crude, but it fails
  differently.
- **Give reviewers a way to say "no".** A scale without "not appropriate" turns a content
  problem into a quality score and hides it.

### Follow-up: correcting the plausibility floor

Andy rated the fresh batch on the two-question page. Two findings changed the plan:

- **The "wow" rule overshot.** The lies were rated great for the game 90% of the time, but
  believable only 2.3 out of 5, so they'd be easy to spot. The rule now says "no less, and no
  more".
- **The model's plausibility now matched Andy to within 0.1 points.** The earlier "too harsh"
  finding came mostly from the mixed scale. Claude had lowered the floor to 2 on that
  evidence and put it back to 3 in the same PR.

Andy also allowed military history that isn't about killing, atrocities or politics.

**Lesson:** a measurement taken with a flawed instrument can point the wrong way. Recheck an
earlier conclusion once the instrument is fixed.

---

## Session 9 (2026-11-25): Stage 5 (assemble rounds)

**Model:** Claude Opus 5.5 in Claude Code.
**Branch:** `feat/pipeline-assemble`.

Claude built stage 5 per the PRD:

- a Haiku style spotter, run 10 times per lie with a reshuffled order each time
- heuristic flags
- balanced lie positions
- predicted difficulty
- rounds written in the shared `Round` schema

A $0.02 run on the previous batch then checked the spotter against Andy's ratings. It
disagreed: it picked lies Andy had rated 2 for believability, and ranked the one he rated 4
near the bottom. Plausibility had matched him closely, so it now leads the ranking and the
spotter becomes a veto (ADR 0011).

### What went wrong

Earlier README edits had been made with a find-and-replace that silently did nothing when the
text didn't match, so the command table was missing `verify`, `generate-lies` and `rating`.
Every scripted doc edit now asserts that its match was found.

### Lesson

**Before a metric selects anything, check it against human judgement.** This took one cheap
run against ratings that already existed.

---

## Session 10 (2026-11-25): Hosting on Vercel and Neon

**Model:** Claude Opus 5.5 in Claude Code.
**Branch:** `feat/hosting`.

Andy asked why a hosted database was needed at all. Claude laid out three options: the
laptop only, the laptop plus a tunnel, or Vercel plus Neon. Andy chose Vercel plus Neon.

Claude walked him through the setup screen by screen:

- two least-privilege roles, created in SQL
- passwords generated in 1Password, without symbols so they're safe in a URL
- the 1Password CLI, so secrets go from 1Password to GitHub without being pasted

Claude never saw a credential. Each check printed shape tests (prefix, role name, no
placeholders) or `op run`-masked output, never values.

The code is `packages/db`, a Postgres content source and `pnpm publish-days`. `pnpm db:check`
confirmed against the real database that the reader can only SELECT and the publisher can't
DELETE.

### What went wrong

- **Node grabbed a flag.** Our scripts' `--env-file` flag is also a Node option, and Node
  took it first. `db:check` doesn't use it.
- **The Claude Code deny rules worked as intended.** They stopped Claude reading or writing
  `.env.local`, so Andy rewrote that file himself.

### Lesson

**Verify secrets by their shape, not by reading them.** "Starts with `postgresql://fibble_reader:`,
no `<`, one `@`" catches most mistakes and reveals nothing.

---

## Session 11 (2026-11-25): From rounds to bank days

**Model:** Claude Opus 5.5 in Claude Code.
**Branch:** `feat/content-days`.

Andy chose to finish content while Vercel support sorts out his account email, and confirmed
the fixed category order. Claude built:

- the Unusual-articles harvest, whose topic subpages map onto the five categories
- a looser surprise gate
- the review page, and `review apply` with a review log
- `build-days`

A free end-to-end check then ran on real output: a review page from two earlier batches,
checked in headless Chrome; simulated decisions, applied twice to show the double-apply
guard; and a day-build dry run. The dry run correctly produced 0 days, because only History
and Arts rounds exist. That's exactly what the Unusual-articles batch is for.

### Two catches

- **A sample harvest brought in "Penis Park".** The hard filter now covers sexual content,
  with lookalike tests ("Sussex", "Penistone").
- **A test built only 1 day of 3.** The placeholder sample days cite one article everywhere,
  and the builder refused to reuse it: the rule working, not a bug.

### Follow-up: launch date and basic dedupe

Andy set the private launch for today: **2026-11-25 is Fibble #1**. `LAUNCH_DATE` now lives in
`@fibble/shared`. `build-days` numbers from it, starts at today when the bank is empty, and
refuses dates before launch. Stage 6 got a basic version: no reused article, and no statement
that shares most of its words with one already in the bank or batch. A test also caught that a
day abandoned partway lost its already-picked rounds; they're now reported as left over.
