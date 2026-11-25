---
stage: verify-judge
version: example-v1
model: claude-sonnet-5-5
status: stub
---

# 4. Verify the lie is false

> **Stub.** This prompt has not been written yet.

**Purpose:** Read retrieved Wikipedia and web evidence for a candidate lie and label it `supported`, `contradicted` or `no-evidence`, with a short rationale citing the evidence. Also rate plausibility 1 to 5 (could a well-read adult believe it?). This must be a different model from the lie generator.

See PRD section 5 for the full stage description and `src/types.ts` for the input and
output types this prompt must produce.
