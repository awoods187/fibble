import { NotImplementedError } from '../errors';
import type { CandidateRound, DedupeResult, Stage } from '../types';

/** Stage 6: reject near-duplicates and recently used articles or entities. */
export const dedupe: Stage<CandidateRound[], DedupeResult[]> = async () => {
  throw new NotImplementedError('dedupe');
};
