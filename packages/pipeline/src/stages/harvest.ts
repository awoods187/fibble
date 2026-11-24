import { NotImplementedError } from '../errors';
import type { Candidate, HarvestInput, Stage } from '../types';

/** Stage 1: pull DYK hooks and unusual-article claims, with article context and revision IDs. */
export const harvest: Stage<HarvestInput, Candidate[]> = async () => {
  throw new NotImplementedError('harvest');
};
