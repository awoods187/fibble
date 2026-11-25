import { RoundSchema } from '@fibble/shared';
import { z } from 'zod';
import { CallUsageSchema } from '../reword/schemas';
import { TraceSchema } from '../schemas';

/** What the style spotter returns for one guess (prompts/example-v1/style-spotter.md). */
export const SpotterGuessSchema = z.object({ pick: z.int(), reason: z.string() });

export const HEURISTIC_FLAGS = [
  'length-outlier',
  'number-mismatch',
  'quote-only-in-lie',
  'exclamation',
  'hedging',
] as const;
export type HeuristicFlag = (typeof HEURISTIC_FLAGS)[number];

/** One candidate lie for a round, as stage 5 scored it. */
export const LieScoreSchema = z.strictObject({
  lieId: z.string(),
  text: z.string(),
  /** Share of spotter guesses that found the lie (PRD: regenerate above 0.7). */
  spotterDetectionRate: z.number().min(0).max(1),
  spotterSamples: z.int().nonnegative(),
  heuristicFlags: z.array(z.enum(HEURISTIC_FLAGS)),
  plausibility: z.int().min(1).max(5).optional(),
});
export type LieScore = z.infer<typeof LieScoreSchema>;

/** An assembled round, ready for dedupe (stage 6) and human review (stage 7). */
export const CandidateRoundSchema = z.strictObject({
  /** The playable round, in the shared puzzle format. */
  round: RoundSchema,
  truthIds: z.tuple([z.string(), z.string()]),
  lieId: z.string(),
  spotterDetectionRate: z.number().min(0).max(1),
  heuristicFlags: z.array(z.enum(HEURISTIC_FLAGS)),
  /** 1 - spotter detection rate, until real player data replaces it. */
  predictedFoolRate: z.number().min(0).max(1),
  /** The other lies that were scored for this round, best first, for the reviewer. */
  alternates: z.array(LieScoreSchema),
  usage: z.array(CallUsageSchema),
  trace: TraceSchema,
});
export type CandidateRound = z.infer<typeof CandidateRoundSchema>;
