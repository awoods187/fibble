import type { Category, LieIndex, Round, Source } from '@fibble/shared';
import type { ModelId } from './models';

/**
 * Typed contracts for the 7 pipeline stages in PRD section 5.
 * Every stage output carries a `trace` so any shipped statement can be traced
 * back to its source revision, prompt version and model.
 */

export interface Trace {
  stage: StageName;
  promptVersion: string;
  model?: ModelId;
  createdAt: string;
}

export type StageName =
  'harvest' | 'reword' | 'generateLies' | 'verify' | 'assemble' | 'dedupe' | 'review';

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

export type HarvestSource = 'dyk' | 'unusual-articles';

export interface HarvestInput {
  source: HarvestSource;
  /** e.g. DYK archive months to read, like "2024-05". */
  months: string[];
  limit: number;
}

export interface Candidate {
  id: string;
  harvestedFrom: HarvestSource;
  /** The raw hook or claim, verbatim from Wikipedia. Never shipped as-is. */
  rawClaim: string;
  article: Source;
  /** Lead and relevant section, used as evidence for later stages. */
  contextText: string;
  /** From Wikidata; living people are routed to rejection. */
  involvesLivingPerson: boolean;
  trace: Trace;
}

/* ---------- Stage 2: select and reword ---------- */

export interface RewordedTruth {
  candidateId: string;
  category: Category;
  /** House style, 80 to 160 characters, our own words. */
  text: string;
  expansion: string;
  source: Source;
  supportingSentence: string;
  entities: string[];
  scores: { surprise: number; verifiability: number };
  entailment: { supported: boolean; unsupportedDetails: string[] };
  trace: Trace;
}

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
