# ADR 0001: One TypeScript monorepo for app and pipeline

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

Fibble has a web game, an offline LLM content pipeline, and a review tool. All three must
agree on one puzzle format; a mismatch could ship a broken day or leak answers. The project
has one developer, so tooling overhead matters.

## Decision

Use a single TypeScript monorepo with pnpm workspaces and Turborepo:

- `packages/shared` holds Zod schemas as the single source of truth, with types inferred from them.
- `apps/web` (Next.js) and `packages/pipeline` both import `shared`.
- Strict TypeScript everywhere, a shared `tsconfig.base.json`, ESLint flat config, Prettier, Vitest.
- Dependency versions are pinned once in the pnpm catalog.
- Library packages export TypeScript source directly, so there's no build step.

TypeScript is pinned to 6.0.x, not 7.x, because `typescript-eslint` 8.74 supports TypeScript
up to 6.0. Revisit when it supports 7.

## Consequences

- One schema change updates the app, the pipeline and the validator together, and CI catches mismatches.
- The pipeline can run in GitHub Actions in the private repo by importing the public package at a pinned version.
- Turborepo caching keeps CI fast as packages grow.
- Everything is tied to the Node and TypeScript ecosystem; a Python ML tool would need a separate boundary.
