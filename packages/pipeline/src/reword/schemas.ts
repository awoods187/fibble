import {
  CATEGORY_NAMES,
  EXPANSION_MAX_LENGTH,
  SourceSchema,
  STATEMENT_MAX_LENGTH,
  STATEMENT_MIN_LENGTH,
} from '@fibble/shared';
import { z } from 'zod';
import { MODELS } from '../models';
import { TraceSchema } from '../schemas';

/**
 * LLM output schemas are kept simple (no length or range limits): structured
 * outputs guarantee the shape, and checks.ts enforces the rules in code, where
 * a failure becomes a named rejection reason instead of a silent retry.
 */

export const CONTENT_FLAGS = [
  'living-person',
  'tragedy',
  'violence',
  'disease',
  'politics',
  'religion',
  'medical',
  'sexual',
  'stale',
  'wrongdoing',
] as const;

/** What the draft model returns (prompts/example-v1/reword.md). */
export const RewordDraftSchema = z.object({
  text: z.string(),
  expansion: z.string(),
  supportingSentence: z.string(),
  category: z.enum(CATEGORY_NAMES),
  entities: z.array(z.string()),
  surprise: z.int(),
  verifiability: z.int(),
  contentFlags: z.array(z.enum(CONTENT_FLAGS)),
});
export type RewordDraft = z.infer<typeof RewordDraftSchema>;

/** What the entailment model returns (prompts/example-v1/entailment.md). */
export const EntailmentSchema = z.object({
  supported: z.boolean(),
  unsupportedDetails: z.array(z.string()),
});
export type Entailment = z.infer<typeof EntailmentSchema>;

const MODEL_IDS = [...new Set(Object.values(MODELS))] as [string, ...string[]];

export const CallUsageSchema = z.strictObject({
  model: z.enum(MODEL_IDS),
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  cacheCreationTokens: z.int().nonnegative(),
  cacheReadTokens: z.int().nonnegative(),
  usd: z.number().nonnegative(),
});

const Score = z.int().min(1).max(5);

/** An accepted truth, ready for lie generation (stage 3). */
export const RewordedTruthSchema = z.strictObject({
  candidateId: z.string().min(1),
  category: z.enum(CATEGORY_NAMES),
  text: z.string().min(STATEMENT_MIN_LENGTH).max(STATEMENT_MAX_LENGTH),
  expansion: z.string().min(1).max(EXPANSION_MAX_LENGTH),
  source: SourceSchema,
  supportingSentence: z.string().min(1),
  entities: z.array(z.string()),
  scores: z.strictObject({ surprise: Score, verifiability: Score }),
  entailment: z.strictObject({
    supported: z.literal(true),
    unsupportedDetails: z.array(z.string()).length(0),
  }),
  /** Every Claude call this truth cost, with its estimated price. */
  usage: z.array(CallUsageSchema),
  trace: TraceSchema,
});

export const REJECTION_REASONS = [
  'living-person',
  'refusal',
  'max-tokens',
  'unparseable',
  'length',
  'hedging',
  'expansion',
  'low-score',
  'content-flag',
  'no-supporting-sentence',
  'copied-source',
  'not-entailed',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/** A candidate that didn't make it, and why. Kept for prompt tuning and review. */
export const RejectionSchema = z.strictObject({
  candidateId: z.string().min(1),
  stage: z.enum(['filter', 'draft', 'checks', 'entailment']),
  reasons: z.array(z.enum(REJECTION_REASONS)).min(1),
  details: z.array(z.string()),
  draft: RewordDraftSchema.optional(),
  usage: z.array(CallUsageSchema),
  trace: TraceSchema,
});
export type Rejection = z.infer<typeof RejectionSchema>;
