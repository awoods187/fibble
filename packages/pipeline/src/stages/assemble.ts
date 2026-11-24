import { NotImplementedError } from '../errors';
import type { AssembleInput, CandidateRound, Stage } from '../types';

/** Stage 5: build a round, run the style spotter, and predict difficulty. */
export const assemble: Stage<AssembleInput, CandidateRound> = async () => {
  throw new NotImplementedError('assemble');
};
