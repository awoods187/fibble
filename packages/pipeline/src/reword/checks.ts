import { EXPANSION_MAX_LENGTH, STATEMENT_MAX_LENGTH, STATEMENT_MIN_LENGTH } from '@fibble/shared';
import type { RejectionReason, RewordDraft } from './schemas';

/**
 * Free checks on a draft, run before paying for the entailment model.
 * Each returns rejection reasons with a human-readable detail.
 */

export interface CheckFailure {
  reason: RejectionReason;
  detail: string;
}

/** Words that hedge a claim. A truth in Fibble is stated plainly or not at all. */
export const HEDGING_PATTERN =
  /\b(reportedly|allegedly|supposedly|apparently|purportedly|rumou?red|it is (said|believed|thought)|some (say|believe)|may have|might have|is said to|was said to)\b/i;

/**
 * Stage 2 gates. Surprise was 4+ and gave every accepted truth a 4 while rejecting most drafts
 * (a 9% yield); the fun ranker now does the choosing (ADR 0009), so surprise only needs 3+.
 * Verifiability stays strict: a vague truth can't be checked.
 */
export const MIN_SURPRISE = 3;
export const MIN_VERIFIABILITY = 4;
/** The longest run of words a statement may share with its source text (PRD licensing). */
export const MAX_SHARED_WORDS = 7;

/** Lower-case words with punctuation stripped, keeping letters and digits in any script. */
export function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? [];
}

/** Length of the longest run of consecutive words that appears in both texts. */
export function longestSharedRun(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  let best = 0;
  // Dynamic programming over word positions; statements are short, so this is cheap.
  let prev = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    const cur = new Array<number>(y.length + 1).fill(0);
    for (let k = 1; k <= y.length; k++) {
      if (x[i - 1] === y[k - 1]) {
        const run = (prev[k - 1] ?? 0) + 1;
        cur[k] = run;
        if (run > best) best = run;
      }
    }
    prev = cur;
  }
  return best;
}

/** Whitespace and quote style don't matter when checking a "verbatim" quote. */
export function normalizeForQuote(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function checkDraft(draft: RewordDraft, evidence: string, hook: string): CheckFailure[] {
  const failures: CheckFailure[] = [];
  const text = draft.text.trim();

  if (text.length < STATEMENT_MIN_LENGTH || text.length > STATEMENT_MAX_LENGTH) {
    failures.push({
      reason: 'length',
      detail: `Statement is ${text.length} characters; must be ${STATEMENT_MIN_LENGTH} to ${STATEMENT_MAX_LENGTH}`,
    });
  }
  for (const [field, value] of [
    ['statement', text],
    ['expansion', draft.expansion],
  ] as const) {
    const hedge = HEDGING_PATTERN.exec(value);
    if (hedge)
      failures.push({ reason: 'hedging', detail: `Hedging word in ${field}: "${hedge[0]}"` });
  }
  const expansion = draft.expansion.trim();
  if (!expansion || expansion.length > EXPANSION_MAX_LENGTH || /[.!?]\s+[A-Z]/.test(expansion)) {
    failures.push({
      reason: 'expansion',
      detail: `Expansion must be one sentence of 1 to ${EXPANSION_MAX_LENGTH} characters`,
    });
  }
  if (draft.surprise < MIN_SURPRISE || draft.verifiability < MIN_VERIFIABILITY) {
    failures.push({
      reason: 'low-score',
      detail: `Scores surprise ${draft.surprise} (needs ${MIN_SURPRISE}+), verifiability ${draft.verifiability} (needs ${MIN_VERIFIABILITY}+)`,
    });
  }
  if (draft.contentFlags.length) {
    failures.push({ reason: 'content-flag', detail: `Flagged: ${draft.contentFlags.join(', ')}` });
  }
  const quote = normalizeForQuote(draft.supportingSentence);
  if (quote.length < 20 || !normalizeForQuote(evidence).includes(quote)) {
    failures.push({
      reason: 'no-supporting-sentence',
      detail: 'The supporting sentence does not appear verbatim in the evidence',
    });
  }
  const shared = Math.max(longestSharedRun(text, evidence), longestSharedRun(text, hook));
  if (shared > MAX_SHARED_WORDS) {
    failures.push({
      reason: 'copied-source',
      detail: `Statement shares a run of ${shared} words with the source; max ${MAX_SHARED_WORDS}`,
    });
  }
  return failures;
}
