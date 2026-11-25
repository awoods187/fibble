---
stage: entailment
version: example-v1
model: claude-opus-5-5
status: stub
---

# 2. Entailment check

> **Stub.** This prompt has not been written yet.

**Purpose:** Given the source text and a reworded truth, decide whether the source supports every detail (numbers, names, dates). Anything not fully supported is rejected, not repaired. Output `supported` and a list of unsupported details.

See PRD section 5 for the full stage description and `src/types.ts` for the input and
output types this prompt must produce.
