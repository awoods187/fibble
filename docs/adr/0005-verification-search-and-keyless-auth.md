# ADR 0005: Verification search (Wikipedia + Tavily) and keyless Claude auth

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

The verification stage (PRD section 5, stage 4) decides whether a generated lie is actually
false. It needs evidence: the PRD calls for Wikipedia's CirrusSearch API plus one web search
API, keeping the top 5 to 10 results. A lie that turns out to be true is the worst failure the
game can have, so a later reviewer must be able to see exactly what evidence a verdict used.

Separately, the pipeline needs credentials for the Claude API, locally and in GitHub Actions.

## Decision

**Search:** Wikipedia CirrusSearch (free, no key) plus [Tavily](https://tavily.com) for the
general web. Tavily is called with plain `fetch` (no SDK dependency) and its key lives in
`SEARCH_API_KEY`, only in `.env.local` and the private repo's Actions secrets. The raw top
results are stored with each verdict.

Options considered:

| Option                         | Why not chosen                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude's built-in `web_search` | No extra key or vendor, but the judge searches inside its own call, so we'd keep only what it cites, not the raw results the PRD wants stored |
| Brave Search API               | A good independent index; Tavily returns cleaned page extracts, which suit an LLM judge better                                                |

**Claude credentials:** no stored API key anywhere.

- Locally, `ant auth login` against the `fibble` Console workspace. The SDK's default
  credential chain picks the login up; `ANTHROPIC_API_KEY` is deliberately left unset because
  it would override it.
- In GitHub Actions, workload identity federation: the workflow's OIDC token is exchanged for
  short-lived access, with the federation rule limited to the `fibble-content` repo.
- Spend is capped by the `fibble` workspace's monthly limit.

## Consequences

- Two search sources to maintain, but each verdict can be re-checked from stored evidence.
- Tavily's free tier caps early spend; moving to paid is a config change, not a code change.
- No long-lived Claude key exists to leak. Local logins expire and need an occasional
  `ant auth login`.
