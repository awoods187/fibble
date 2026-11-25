import { CATEGORY_NAMES, SourceSchema } from '@fibble/shared';
import { z } from 'zod';
import type { LieInput, VerificationLabel, VerifiedLie } from '../verify/schemas';
import { VERIFICATION_LABELS } from '../verify/schemas';

/**
 * Golden-set eval for stage 4 (evals/README.md). Known truths pose as lies: the
 * judge must catch them. Known lies must pass. The false-lie rate is the number
 * that matters most: a true statement shown as the lie is the worst failure.
 */

export const GoldenItemSchema = z
  .strictObject({
    id: z.string().min(1),
    category: z.enum(CATEGORY_NAMES),
    text: z.string().min(1),
    expected: z.enum(['truth', 'lie']),
    expectedJudgeLabel: z.enum(VERIFICATION_LABELS),
    source: SourceSchema.optional(),
    notes: z.string().optional(),
  })
  .refine((i) => (i.expected === 'truth') === (i.source !== undefined), {
    message: 'Truths need a source; lies must not have one',
  })
  .refine((i) => (i.expected === 'truth') === (i.expectedJudgeLabel === 'supported'), {
    message: 'A truth should be judged "supported"; a lie "contradicted" or "no-evidence"',
  });

export const GoldenSetSchema = z.strictObject({
  version: z.string().min(1),
  items: z.array(GoldenItemSchema).min(1),
});
export type GoldenItem = z.infer<typeof GoldenItemSchema>;
export type GoldenSet = z.infer<typeof GoldenSetSchema>;

export function goldenToLies(set: GoldenSet): LieInput[] {
  return set.items.map(({ id, category, text }) => ({ id, category, text }));
}

export interface Miss {
  id: string;
  expected: GoldenItem['expected'];
  label: VerificationLabel | 'unjudged';
  plausibility?: number;
  passed: boolean;
  why: string;
}

export interface VerifyEvalReport {
  version: string;
  truths: number;
  lies: number;
  /** Truths that passed as lies: the headline metric. Lower is better; the target is 0. */
  falseLieRate: number;
  /** Truths the judge didn't label "supported", whether or not plausibility saved them. */
  truthsNotCaught: number;
  /** Lies that passed. Higher is better. */
  lieRecall: number;
  /** Lies the judge wrongly labeled "supported". */
  liesLabeledSupported: number;
  /** Lies rejected only for low plausibility. */
  liesLowPlausibility: number;
  unjudged: number;
  labels: Record<GoldenItem['expected'], Record<VerificationLabel | 'unjudged', number>>;
  misses: Miss[];
  spentUsd: number;
  webSearches: number;
}

const ratio = (n: number, d: number) => (d ? n / d : 0);

export function scoreVerifyEval(
  set: GoldenSet,
  verified: VerifiedLie[],
  spentUsd: number,
): VerifyEvalReport {
  const byId = new Map(verified.map((v) => [v.lie.id, v]));
  const blank = () => ({ supported: 0, contradicted: 0, 'no-evidence': 0, unjudged: 0 });
  const labels = { truth: blank(), lie: blank() };
  const misses: Miss[] = [];
  let truths = 0;
  let lies = 0;
  let falsePasses = 0;
  let truthsNotCaught = 0;
  let liesPassed = 0;
  let liesLabeledSupported = 0;
  let liesLowPlausibility = 0;
  let unjudged = 0;
  let webSearches = 0;

  for (const item of set.items) {
    const v = byId.get(item.id);
    if (!v) continue; // not run (budget or --limit)
    webSearches += v.webSearches;
    const label = v.label ?? 'unjudged';
    labels[item.expected][label]++;
    if (!v.label) unjudged++;
    const miss = (why: string) =>
      misses.push({
        id: item.id,
        expected: item.expected,
        label,
        plausibility: v.plausibility,
        passed: v.passed,
        why,
      });

    if (item.expected === 'truth') {
      truths++;
      if (v.passed) {
        falsePasses++;
        miss('FALSE LIE: a true statement passed as the lie');
      }
      if (label !== 'supported') {
        truthsNotCaught++;
        if (!v.passed)
          miss(
            v.label
              ? 'Truth not labeled supported (saved by low plausibility)'
              : `Unjudged: ${v.error}`,
          );
      }
    } else {
      lies++;
      if (v.passed) liesPassed++;
      else if (label === 'supported') {
        liesLabeledSupported++;
        miss('Lie labeled supported');
      } else if (v.label) {
        liesLowPlausibility++;
        miss('Lie failed on plausibility');
      } else miss(`Unjudged: ${v.error}`);
    }
  }

  return {
    version: set.version,
    truths,
    lies,
    falseLieRate: ratio(falsePasses, truths),
    truthsNotCaught,
    lieRecall: ratio(liesPassed, lies),
    liesLabeledSupported,
    liesLowPlausibility,
    unjudged,
    labels,
    misses,
    spentUsd,
    webSearches,
  };
}
