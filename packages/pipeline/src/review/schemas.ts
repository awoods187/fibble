import { CATEGORY_NAMES, RoundSchema } from '@fibble/shared';
import { z } from 'zod';

/**
 * Stage 7 (human review), minimum version (ADR 0013). Every round a player will see has
 * been approved by a person: no round reaches bank/ any other way.
 */

/** One lie the reviewer can choose for a round: the assembled one or an alternate. */
export const LieOptionSchema = z.strictObject({
  lieId: z.string(),
  text: z.string(),
  lieNote: z.string(),
  plausibility: z.int().min(1).max(5).optional(),
  spotterDetectionRate: z.number().min(0).max(1),
});
export type LieOption = z.infer<typeof LieOptionSchema>;

/** What the review page shows for one round. */
export const ReviewItemSchema = z.strictObject({
  /** Stable: derived from the two truth ids. */
  roundId: z.string(),
  category: z.enum(CATEGORY_NAMES),
  /** The two truths, with what the reveal shows. */
  truths: z.array(
    z.strictObject({
      text: z.string(),
      expansion: z.string(),
      sourceTitle: z.string(),
      sourceUrl: z.string(),
    }),
  ),
  /** The assembled lie first, then alternates, best first. */
  lies: z.array(LieOptionSchema).min(1),
  heuristicFlags: z.array(z.string()),
});
export type ReviewItem = z.infer<typeof ReviewItemSchema>;

export const REJECT_REASONS = [
  'not-ok',
  'boring',
  'truth-wrong',
  'lie-might-be-true',
  'lie-too-easy',
  'other',
] as const;

/** The file the review page downloads. */
export const ReviewDecisionsSchema = z.strictObject({
  setId: z.string(),
  decidedAt: z.string(),
  decisions: z.array(
    z.discriminatedUnion('decision', [
      z.strictObject({
        roundId: z.string(),
        decision: z.literal('approved'),
        lieId: z.string(),
        note: z.string().optional(),
      }),
      z.strictObject({
        roundId: z.string(),
        decision: z.literal('rejected'),
        reason: z.enum(REJECT_REASONS),
        note: z.string().optional(),
      }),
    ]),
  ),
});
export type ReviewDecisions = z.infer<typeof ReviewDecisionsSchema>;

/** A round a person approved, ready for day assembly. */
export const ApprovedRoundSchema = z.strictObject({
  roundId: z.string(),
  round: RoundSchema,
  truthIds: z.tuple([z.string(), z.string()]),
  lieId: z.string(),
  /** The truths' Wikipedia articles, so a day never reuses one already in the bank. */
  sourceTitles: z.array(z.string()),
  reviewSetId: z.string(),
  reviewedBy: z.string(),
  reviewedAt: z.string(),
});
export type ApprovedRound = z.infer<typeof ApprovedRoundSchema>;

/** The review-log entry for one review session (fibble-content/review-log/). */
export const ReviewLogSchema = z.strictObject({
  reviewSetId: z.string(),
  reviewedBy: z.string(),
  reviewedAt: z.string(),
  counts: z.strictObject({ approved: z.int(), rejected: z.int(), undecided: z.int() }),
  decisions: z.array(
    z.strictObject({
      roundId: z.string(),
      category: z.enum(CATEGORY_NAMES),
      decision: z.enum(['approved', 'rejected']),
      lieId: z.string().optional(),
      usedAlternateLie: z.boolean(),
      reason: z.enum(REJECT_REASONS).optional(),
      note: z.string().optional(),
      truthIds: z.tuple([z.string(), z.string()]),
      promptVersion: z.string(),
    }),
  ),
});
export type ReviewLog = z.infer<typeof ReviewLogSchema>;
