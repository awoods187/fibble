import { NotImplementedError } from '../errors';
import type { DedupeResult, ReviewRecord, Stage } from '../types';

/** Stage 7: record a human reviewer's approve, edit or reject decision. */
export const review: Stage<DedupeResult[], ReviewRecord[]> = async () => {
  throw new NotImplementedError('review');
};
