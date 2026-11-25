## Summary

<!-- What changed and why. -->

## Checklist

- [ ] `pnpm format:check`, `lint`, `typecheck`, `test`, `validate:content`, `build` pass
- [ ] New functions have tests (CLAUDE.md rule 4)
- [ ] `pnpm check:secrets` passes; no secrets, and no real or future puzzles (only `content-example/`, marked `"sample": true`)
- [ ] Answers still never reach the client before a choice; leak tests pass
- [ ] Schema changes made in `packages/shared/src/schema.ts`, not in parallel types
- [ ] New dependencies pinned in the `catalog:` and approved
- [ ] `docs/ai-development.md` updated for significant LLM-assisted work

## What's left for Andy

<!-- Manual steps, decisions or follow-ups, or "Nothing". -->
