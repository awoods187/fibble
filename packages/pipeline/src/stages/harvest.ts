import { harvestDyk } from '../harvest/run';
import { WikiClient } from '../harvest/wiki-client';
import type { Candidate, HarvestInput, Stage } from '../types';

/**
 * Stage 1: pull DYK hooks with article context, revision IDs and a living-person flag.
 * Uses a WikiClient caching to .cache/wikipedia under the current directory;
 * call harvestDyk directly to supply your own client or read the run stats.
 */
export const harvest: Stage<HarvestInput, Candidate[]> = async (input, ctx) => {
  const client = new WikiClient({ cacheDir: '.cache/wikipedia' });
  const { candidates } = await harvestDyk(input, ctx, client);
  return candidates;
};
