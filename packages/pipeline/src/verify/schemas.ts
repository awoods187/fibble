import { CATEGORY_NAMES } from '@fibble/shared';
import { z } from 'zod';
import { CallUsageSchema } from '../reword/schemas';
import { TraceSchema } from '../schemas';

/** A statement to verify: a generated lie, or a golden-set item posing as one. */
export const LieInputSchema = z.strictObject({
  id: z.string().min(1),
  category: z.enum(CATEGORY_NAMES),
  text: z.string().min(1),
});
export type LieInput = z.infer<typeof LieInputSchema>;

/** What the query model returns (prompts/example-v1/verify-queries.md). */
export const SearchQueriesSchema = z.object({ queries: z.array(z.string()) });

export const VERIFICATION_LABELS = ['supported', 'contradicted', 'no-evidence'] as const;
export type VerificationLabel = (typeof VERIFICATION_LABELS)[number];

/** What the judge returns (prompts/example-v1/verify-judge.md). */
export const JudgeSchema = z.object({
  label: z.enum(VERIFICATION_LABELS),
  rationale: z.string(),
  /** Numbers of the evidence items the rationale relies on, as shown to the judge (1-based). */
  citedEvidence: z.array(z.int()),
});
export type Judgement = z.infer<typeof JudgeSchema>;

/** What the plausibility model returns (prompts/example-v1/plausibility.md). It sees no evidence. */
export const PlausibilitySchema = z.object({ plausibility: z.int(), reason: z.string() });

export const EvidenceSchema = z.strictObject({
  url: z.string(),
  title: z.string(),
  snippet: z.string(),
  retrievedFrom: z.enum(['wikipedia-search', 'web-search']),
  query: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/**
 * Plausibility floor: the PRD's 3+. Briefly lowered to 2 after the first human ratings
 * seemed to show the model 1.7 points too harsh, but that page mixed believability with
 * "good for the game". On the two-question page the model matched the human to within
 * 0.1 points, and a floor of 3 rejects exactly the lies the human doubted (ADR 0009).
 */
export const MIN_PLAUSIBILITY = 3;

/** A verdict on one lie, with every piece of evidence it was based on (ADR 0005). */
export const VerifiedLieSchema = z.strictObject({
  lie: LieInputSchema,
  queries: z.array(z.string()),
  evidence: z.array(EvidenceSchema),
  /** Absent when the lie couldn't be judged; see `error`. */
  label: z.enum(VERIFICATION_LABELS).optional(),
  /** Rated from the statement alone, before any evidence (2+ to pass; see MIN_PLAUSIBILITY). */
  plausibility: z.int().min(1).max(5).optional(),
  plausibilityReason: z.string().optional(),
  judgeRationale: z.string(),
  citedEvidence: z.array(z.int()),
  /** True only for contradicted or no-evidence with plausibility >= MIN_PLAUSIBILITY, judged on real evidence. */
  passed: z.boolean(),
  /** Why the lie couldn't be judged (no evidence retrieved, a refusal...). Never passes. */
  error: z.string().optional(),
  searchErrors: z.array(z.string()),
  usage: z.array(CallUsageSchema),
  webSearches: z.int().nonnegative(),
  trace: TraceSchema,
});
export type VerifiedLie = z.infer<typeof VerifiedLieSchema>;
