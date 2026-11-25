import { EXPANSION_MAX_LENGTH, STATEMENT_MAX_LENGTH, STATEMENT_MIN_LENGTH } from '@fibble/shared';
import { HEDGING_PATTERN, longestSharedRun, words } from '../reword/checks';
import type { RewordedTruth } from '../types';
import type { GeneratedLie, LieRejectionReason } from './schemas';

/**
 * Free checks on generated lies, before paying to verify them (PRD section 5,
 * stage 3 rules that code can check).
 */

export interface LieCheckFailure {
  reason: LieRejectionReason;
  detail: string;
}

/** PRD: the lie is within 15% of the truths' average length. */
export const LENGTH_TOLERANCE = 0.15;
/** Longest run of words a lie may share with either truth. */
export const MAX_SHARED_WITH_TRUTH = 4;
/** Lies sharing more than this fraction of their content words are near-duplicates. */
export const DUPLICATE_OVERLAP = 0.6;

const hasDigit = (s: string) => /\d/.test(s);

/** Content words of 4+ letters, for overlap comparisons. */
function contentSet(text: string): Set<string> {
  return new Set(words(text).filter((w) => w.length >= 4));
}

/** Share of the smaller set's words that also appear in the other set. */
export function overlap(a: string, b: string): number {
  const x = contentSet(a);
  const y = contentSet(b);
  const small = x.size <= y.size ? x : y;
  const big = small === x ? y : x;
  if (!small.size) return 0;
  let shared = 0;
  for (const w of small) if (big.has(w)) shared++;
  return shared / small.size;
}

/** An entity "appears" in a lie when all of its words of 4+ letters do. */
function mentions(text: string, entity: string): boolean {
  const lieWords = new Set(words(text));
  const entityWords = words(entity).filter((w) => w.length >= 4);
  return entityWords.length > 0 && entityWords.every((w) => lieWords.has(w));
}

export function checkLie(
  lie: GeneratedLie,
  truths: [RewordedTruth, RewordedTruth],
): LieCheckFailure[] {
  const failures: LieCheckFailure[] = [];
  const text = lie.text.trim();
  const len = text.length;

  if (len < STATEMENT_MIN_LENGTH || len > STATEMENT_MAX_LENGTH) {
    failures.push({
      reason: 'length',
      detail: `Lie is ${len} characters; must be ${STATEMENT_MIN_LENGTH} to ${STATEMENT_MAX_LENGTH}`,
    });
  }
  const avg = (truths[0].text.length + truths[1].text.length) / 2;
  if (Math.abs(len - avg) > avg * LENGTH_TOLERANCE) {
    failures.push({
      reason: 'length-mismatch',
      detail: `Lie is ${len} characters; the truths average ${Math.round(avg)} (±${LENGTH_TOLERANCE * 100}%)`,
    });
  }
  const hedge = HEDGING_PATTERN.exec(text);
  if (hedge) failures.push({ reason: 'hedging', detail: `Hedging word: "${hedge[0]}"` });

  const note = lie.lieNote.trim();
  if (!note || note.length > EXPANSION_MAX_LENGTH || /[.!?]\s+[A-Z]/.test(note)) {
    failures.push({
      reason: 'lie-note',
      detail: `lieNote must be one sentence of 1 to ${EXPANSION_MAX_LENGTH} characters`,
    });
  }

  for (const t of truths) {
    const named = t.entities.filter((e) => mentions(text, e));
    if (named.length) {
      failures.push({
        reason: 'same-topic',
        detail: `Names a truth's subject: ${named.join(', ')}`,
      });
    }
    const shared = longestSharedRun(text, t.text);
    if (shared > MAX_SHARED_WITH_TRUTH) {
      failures.push({
        reason: 'copied-truth',
        detail: `Shares ${shared} words in a row with a truth`,
      });
    }
  }
  if (hasDigit(truths[0].text) && hasDigit(truths[1].text) && !hasDigit(text)) {
    failures.push({
      reason: 'needs-number',
      detail: 'Both truths contain a number, so the lie must too',
    });
  }
  return failures;
}

/** Indexes of lies that are near-duplicates of an earlier lie in the list. */
export function duplicateIndexes(lies: { text: string }[]): Set<number> {
  const dupes = new Set<number>();
  lies.forEach((lie, i) => {
    for (let k = 0; k < i; k++) {
      if (!dupes.has(k) && overlap(lie.text, lies[k]?.text ?? '') > DUPLICATE_OVERLAP) {
        dupes.add(i);
        break;
      }
    }
  });
  return dupes;
}
