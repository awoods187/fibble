import { WikiClient } from '../harvest/wiki-client';
import { AnthropicLlmClient, Budget } from '../llm';
import { EXAMPLE_PROMPTS_DIR, loadPrompt } from '../prompts';
import type { Stage } from '../types';
import { verifyLies } from '../verify/run';
import type { LieInput, VerifiedLie } from '../verify/schemas';
import { TavilyClient } from '../verify/tavily';

/** Default spend cap for one call of this stage, in US dollars. */
export const DEFAULT_VERIFY_BUDGET_USD = 1;

/**
 * Stage 4: retrieve evidence for each lie and have a different model judge it.
 * Reads SEARCH_API_KEY from the environment and caches searches under .cache/.
 * Call verifyLies directly to choose prompts, clients or the budget, or to read stats.
 */
export const verify: Stage<LieInput[], VerifiedLie[]> = async (lies, ctx) => {
  const { verified } = await verifyLies(lies, ctx, {
    llm: new AnthropicLlmClient(),
    prompts: {
      queries: await loadPrompt(EXAMPLE_PROMPTS_DIR, 'verify-queries'),
      judge: await loadPrompt(EXAMPLE_PROMPTS_DIR, 'verify-judge'),
      plausibility: await loadPrompt(EXAMPLE_PROMPTS_DIR, 'plausibility'),
    },
    wiki: new WikiClient({ cacheDir: '.cache/wikipedia' }),
    tavily: new TavilyClient({
      apiKey: process.env.SEARCH_API_KEY ?? '',
      cacheDir: '.cache/tavily',
    }),
    budget: new Budget(DEFAULT_VERIFY_BUDGET_USD),
  });
  return verified;
};
