import type { Category, LieIndex, Round } from '@fibble/shared';
import type { z } from 'zod';
import type {
  CandidateSchema,
  HarvestMonthSchema,
  HarvestSourceSchema,
  StageNameSchema,
  TraceSchema,
} from './schemas';
import type { RewordedTruthSchema } from './reword/schemas';

/**
 * Typed contracts for the 7 pipeline stages in PRD section 5.
 * Every stage output carries a `trace` so any shipped statement can be traced
 * back to its source revision, prompt version and model.
 */

export type Trace = z.infer<typeof TraceSchema>;

export type StageName = z.infer<typeof StageNameSchema>;

/** A pipeline stage: an async function from one typed record set to the next. */
export type Stage<In, Out> = (input: In, ctx: StageContext) => Promise<Out>;

export interface StageContext {
  /** e.g. "example-v1" here, "production-vN" in the private repo. */
  promptVersion: string;
  /** When true, stages must not call paid APIs. */
  dryRun: boolean;
  now: Date;
}

/* ---------- Stage 1: harvest ---------- */

export type HarvestSource = z.infer<typeof HarvestSourceSchema>;
export type HarvestMonth = z.infer<typeof HarvestMonthSchema>;

export interface HarvestInput {
  source: HarvestSource;
  /** DYK archive months to read, like "2024-05". */
  months: HarvestMonth[];
  /** Stop after this many candidates. */
  limit: number;
}

export type Candidate = z.infer<typeof CandidateSchema>;

/* ---------- Stage 2: select and reword ---------- */

export type RewordedTruth = z.infer<typeof RewordedTruthSchema>;

/* ---------- Stage 3: generate lies ---------- */

export interface GenerateLiesInput {
  category: Category;
  truths: [RewordedTruth, RewordedTruth];
  /** How many candidates to ask for (PRD: 5). */
  count: number;
}

export interface LieCandidate {
  id: string;
  category: Category;
  text: string;
  /** The "why it sounded true" note. */
  lieNote: string;
  basedOnTruthIds: [string, string];
  trace: Trace;
}

/* ---------- Stage 4: verify the lie is false ---------- */

export type VerificationLabel = 'supported' | 'contradicted' | 'no-evidence';

export interface Evidence {
  url: string;
  title: string;
  snippet: string;
  retrievedFrom: 'wikipedia-search' | 'web-search';
}

export interface VerifiedLie {
  lie: LieCandidate;
  evidence: Evidence[];
  label: VerificationLabel;
  /** 1 to 5: could a well-read adult believe it? PRD wants 3+. */
  plausibility: number;
  judgeRationale: string;
  /** True only for contradicted or no-evidence with plausibility >= 3. */
  passed: boolean;
  trace: Trace;
}

/* ---------- Stage 5: assemble and calibrate ---------- */

export interface AssembleInput {
  truths: [RewordedTruth, RewordedTruth];
  lies: VerifiedLie[];
}

export interface CandidateRound {
  round: Round;
  /** Fraction of style-spotter guesses that found the lie. */
  spotterDetectionRate: number;
  heuristicFlags: string[];
  predictedFoolRate: number;
  lieIndex: LieIndex;
  trace: Trace;
}

/* ---------- Stage 6: dedupe ---------- */

export interface DedupeResult {
  round: CandidateRound;
  duplicate: boolean;
  nearestSimilarity: number;
  reason?: string;
  trace: Trace;
}

/* ---------- Stage 7: human review ---------- */

export type ReviewDecision = 'approved' | 'edited' | 'rejected';

export interface ReviewRecord {
  round: CandidateRound;
  decision: ReviewDecision;
  reviewer: string;
  reviewerDifficulty?: number;
  notes?: string;
  trace: Trace;
}
