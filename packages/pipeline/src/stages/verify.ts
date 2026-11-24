import { NotImplementedError } from '../errors';
import type { LieCandidate, Stage, VerifiedLie } from '../types';

/** Stage 4: retrieve evidence and have a different model judge whether each lie is false. */
export const verify: Stage<LieCandidate[], VerifiedLie[]> = async () => {
  throw new NotImplementedError('verify');
};
