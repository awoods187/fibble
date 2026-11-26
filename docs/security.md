# Security

What Fibble protects, how, and what's still open. Last reviewed 2026-11-25.

## What we protect

| Asset                                          | Where it lives                                      | Risk if exposed                      |
| ---------------------------------------------- | --------------------------------------------------- | ------------------------------------ |
| Claude API access                              | No key exists: `ant auth login` and federation      | Spend on our account                 |
| Tavily key (`SEARCH_API_KEY`)                  | `fibble-content` Actions secret, local `.env.local` | Spend on our account                 |
| Database: reader (`DATABASE_URL`)              | Vercel env var (Production), 1Password              | Read published days: at most 4 ahead |
| Database: publisher (`DATABASE_URL_PUBLISHER`) | `fibble-content` Actions secret, 1Password          | Insert and update days; never delete |
| Future puzzles and answers                     | Private `fibble-content` repo, then the database    | The game is spoiled                  |

## Keeping keys out of the code

- **No Claude key.** Locally the SDK uses the `ant auth login` profile; in CI, GitHub's
  OIDC token is exchanged for short-lived access (workload identity federation). The
  `fibble` Console workspace has a monthly spend cap. See
  [ADR 0005](adr/0005-verification-search-and-keyless-auth.md).
- **`pnpm check:secrets`** (`tools/security/`) scans every committable file for Anthropic,
  Tavily, GitHub and AWS keys, private keys, database URLs with passwords, and secret env
  vars given literal values. CI runs it on the repo **and on the built browser bundle**,
  where secret env var _names_ also fail the build. Matches are masked in the output.
- **Tests** (`tools/security/src/repo-guards.test.ts`, `apps/web/test/security.test.ts`)
  check that:
  - every `.env*` file is git-ignored except `.env.example`
  - `.env.example` has only empty values and never sets `ANTHROPIC_API_KEY`
  - no `NEXT_PUBLIC_` variable looks like a secret
  - client components never import server-only modules or read `process.env`
- **GitHub secret scanning with push protection** is on for this public repo, and blocks a
  push containing a known key format. The private repo can't have it on GitHub Free, so it
  runs `check:secrets` in CI and in a pre-commit hook instead.
- **AI coding agents** are told the rules in [AGENTS.md](../AGENTS.md), and
  `.claude/settings.json` stops Claude Code reading `.env` files and the `ant` credential
  store. These deny rules cover file reads only, so they are a guard rail, not a sandbox.

## Who can use our accounts

- **Claude:** only our `ant` login and, once set up, a federation rule that accepts tokens
  from `awoods187/fibble-content` workflows on `main` only.
- **Database (ADR 0012):** two least-privilege roles. The app's `fibble_reader` can only
  `SELECT`; the publish job's `fibble_publisher` can insert and update but never delete.
  The owner's connection string is stored nowhere. `pnpm db:check` verifies the privileges.
- **Local secrets live in 1Password** and are used through `op run`, so `.env.local` holds
  only `op://` references. Scripts refuse a reference that wasn't resolved.
- **Tavily:** whoever holds the key, so it lives in exactly two places (above). Stay on the
  free plan or a hard usage cap, so a leaked key can't run up a bill.
- **GitHub:** `awoods187` is the only collaborator, with no deploy keys or webhooks.
  Workflows get a read-only token and can't approve PRs. No workflow uses
  `pull_request_target`, so PRs from forks never see secrets, and a first-time
  contributor's workflow runs only after approval.
- **Supply chain:** every GitHub Action is pinned to a full commit SHA (Dependabot updates
  the pins), Dependabot opens security updates, and CI runs `pnpm audit` on production
  dependencies.

## The game API

The API is public by design: players' browsers call it. What protects it:

- The date gate: a day is served only once it has started in UTC+14. Unreleased and
  missing dates return the same 404.
- The allow-list: puzzle responses go through `toPublicPuzzle`, and leak tests walk every
  key of every response.
- Answer bodies over 1 KB get a 413 before they're parsed. Every API response is
  `Cache-Control: no-store` and `X-Robots-Tag: noindex`.
- Security headers on every page: no framing, no MIME sniffing, strict referrers, HSTS, and
  no `X-Powered-By`.
- A strict, nonce-based Content-Security-Policy on every page (`src/proxy.ts`,
  `pageCsp` in `src/lib/security/headers.ts`): scripts run only with that request's random
  nonce, everything else loads from our own origin. The API and static files keep the
  baseline policy. The service worker (`public/sw.js`) never caches the API.
- `robots.txt` keeps all crawlers off `/api/` and blocks AI training crawlers site-wide;
  `ai.txt` and `llms.txt` ask agents not to fetch or reveal answers. These are voluntary.

## Known gaps

| Gap                                                       | Plan                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| Anyone can POST every choice to a round and learn the lie | One graded answer per round per player, once the database exists |
| No rate limiting                                          | Vercel firewall rate limit on `/api/*` at first deploy           |
| `fibble-content` `main` isn't protected (GitHub Free)     | GitHub Pro, or keep the honor system                             |
| `robots.txt`, `ai.txt` and `llms.txt` can be ignored      | Rate limiting and bot rules at the edge                          |

## If a secret leaks

1. **Rotate it first.** Revoke it in the provider's dashboard (Tavily, Neon, GitHub, the
   Anthropic Console) and issue a new one. Removing it from git does not make it safe.
2. Update the GitHub Actions secret and your `.env.local`.
3. Check the provider's usage for activity you don't recognise.
4. Then clean up the history, and record what happened in `docs/ai-development.md`.
