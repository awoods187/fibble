import { NotImplementedError } from '../errors';
import type { GenerateLiesInput, LieCandidate, Stage } from '../types';

/** Stage 3: write candidate lies that match the round's truths in length and specificity. */
export const generateLies: Stage<GenerateLiesInput, LieCandidate[]> = async () => {
  throw new NotImplementedError('generateLies');
};
