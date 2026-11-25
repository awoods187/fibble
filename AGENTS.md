# AGENTS.md

Instructions for AI coding agents (Codex, Cursor, Copilot, Claude Code and others).
**[CLAUDE.md](CLAUDE.md) is the full guide; read it first.** The rules below are the ones
that must never be broken, repeated here in case an agent reads only this file.

## Security rules

1. **Never read, print, copy or commit secrets.** Don't open `.env.local` or any other `.env`
   file except `.env.example`, which holds variable names only. Don't echo environment
   variables, and never put a key in code, tests, logs, commit messages, PRs or issues.
2. **Claude needs no key.** Use the developer's `ant auth login`. Never set or ask for
   `ANTHROPIC_API_KEY`.
3. **Never commit real puzzles.** Only `content-example/` (marked `"sample": true`) is public.
4. **Answers never reach the browser before a choice.** Puzzle responses go through
   `toPublicPuzzle`; don't bypass `getPlayablePuzzle`.
5. **Run `pnpm check:secrets` before committing.** CI runs it on the repo and on the built
   browser bundle, and a finding fails the build.
6. **Work on a branch and open a PR.** `main` is protected and needs the CI check to pass.

If you find an exposed secret, stop and tell the human: the key must be rotated, and
deleting it from git history doesn't make it safe.

See [docs/security.md](docs/security.md) for the threat model.
