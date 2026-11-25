# ADR 0010: A hard content filter for banned topics

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

A truth about a school's Nazi-themed parade reached a human rater. Haiku's content flags
didn't include extremism, racism or atrocities, and its "politics" flag covered only the
last 30 years. The fun ranker rated it "fine", and the rating page had no way to say
"not appropriate". Every safeguard depended on a model noticing.

## Decision

- **A code-level filter** (`src/content/sensitive.ts`) for three banned topics:
  - **extremism:** Nazis, Hitler, swastikas, fascism, the KKK, white supremacy, hate groups
  - **atrocities:** genocide, the Holocaust, massacres, concentration camps, war crimes,
    terrorism
  - **racism:** racism, segregation, apartheid, slavery, lynching, eugenics

  It runs on:
  - the hook, **before any model call**, so a banned topic costs nothing
  - every draft statement and reveal, before entailment
  - every lie and lie note
  - everything put in front of a human rater

- **Deliberately broad.** A false positive costs one candidate; a false negative puts
  something hurtful in front of players. For example, "anti-racist" in a reveal is flagged,
  and that's accepted.
- **Broader model flags too:**
  - `extremism`, `racism` and `atrocity` are new flags.
  - `politics` now covers parties, ideologies, movements and political leaders from any era.
  - `violence` covers killing, abuse and cruelty. **Military history is allowed** (Andy's
    call): battles, forts, commanders and odd wartime episodes, as long as it isn't about
    killing, atrocities or a political cause.

  The lie and ranking prompts carry the same rules.

- **"Not OK" on the rating page,** separate from "boring". The report lists those items: each
  one is a miss to fix by adding terms or flags.

## Consequences

- Swept over everything generated so far (68 statements, 180 hooks), the filter catches the
  parade truth and one harmless reveal. It would have dropped 4 hooks before any spend.
- **Keyword lists miss paraphrases** (for example, "a 1930s German dictator"), so model flags
  and human review stay. The human review stage (stage 7) remains the final gate.
