import {
  CATEGORY_NAMES,
  EXPANSION_MAX_LENGTH,
  STATEMENT_MAX_LENGTH,
  STATEMENT_MIN_LENGTH,
} from '@fibble/shared';
import { z } from 'zod';
import { CallUsageSchema } from '../reword/schemas';
import { TraceSchema } from '../schemas';

/** What the generator returns (prompts/example-v1/generate-lies.md). Rules are checked in code. */
export const GeneratedLiesSchema = z.object({
  lies: z.array(z.object({ text: z.string(), lieNote: z.string(), borrowedTexture: z.string() })),
});
export type GeneratedLie = z.infer<typeof GeneratedLiesSchema>['lies'][number];

export const LIE_REJECTION_REASONS = [
  'length',
  'length-mismatch',
  'hedging',
  'lie-note',
  'same-topic',
  'copied-truth',
  'needs-number',
  'duplicate',
  'sensitive-topic',
] as const;
export type LieRejectionReason = (typeof LIE_REJECTION_REASONS)[number];

/** One generated lie that passed the code checks, ready for stage 4. */
export const LieCandidateSchema = z.strictObject({
  /** Stable: derived from the two truth ids and the text. */
  id: z.string().min(1),
  category: z.enum(CATEGORY_NAMES),
  text: z.string().min(STATEMENT_MIN_LENGTH).max(STATEMENT_MAX_LENGTH),
  /** The "why it sounded true" line shown after the reveal. */
  lieNote: z.string().min(1).max(EXPANSION_MAX_LENGTH),
  /** For the human reviewer only; never shown to players. */
  borrowedTexture: z.string(),
  basedOnTruthIds: z.tuple([z.string(), z.string()]),
  trace: TraceSchema,
});
export type LieCandidate = z.infer<typeof LieCandidateSchema>;

/** A generated lie the code checks rejected, kept for prompt tuning. */
export const RejectedLieSchema = z.strictObject({
  basedOnTruthIds: z.tuple([z.string(), z.string()]),
  lie: z.object({ text: z.string(), lieNote: z.string(), borrowedTexture: z.string() }),
  reasons: z.array(z.enum(LIE_REJECTION_REASONS)).min(1),
  details: z.array(z.string()),
});
export type RejectedLie = z.infer<typeof RejectedLieSchema>;

/** One generator call: a truth pair and what came back. */
export const GenerationRecordSchema = z.strictObject({
  category: z.enum(CATEGORY_NAMES),
  truthIds: z.tuple([z.string(), z.string()]),
  requested: z.int().positive(),
  returned: z.int().nonnegative(),
  accepted: z.array(LieCandidateSchema),
  rejected: z.array(RejectedLieSchema),
  /** Set when the generator call itself failed (refusal, unparseable...). */
  error: z.string().optional(),
  usage: z.array(CallUsageSchema),
  trace: TraceSchema,
});
export type GenerationRecord = z.infer<typeof GenerationRecordSchema>;
