import { NotImplementedError } from '../errors';
import type { Candidate, RewordedTruth, Stage } from '../types';

/** Stage 2: extract one claim, rewrite it in house style, score it, and check entailment. */
export const reword: Stage<Candidate[], RewordedTruth[]> = async () => {
  throw new NotImplementedError('reword');
};
