import { generateForPairs } from '../generate/run';
import { AnthropicLlmClient, Budget } from '../llm';
import { EXAMPLE_PROMPTS_DIR, loadPrompt } from '../prompts';
import type { GenerateLiesInput, LieCandidate, Stage } from '../types';

/** Default spend cap for one call of this stage, in US dollars. */
export const DEFAULT_GENERATE_BUDGET_USD = 1;

/**
 * Stage 3: write candidate lies for one truth pair (Opus) and drop the ones that
 * break the rules code can check. Call generateForPairs directly for many pairs,
 * your own prompts or budget, or the rejected lies.
 */
export const generateLies: Stage<GenerateLiesInput, LieCandidate[]> = async (input, ctx) => {
  const { records } = await generateForPairs([input.truths], ctx, {
    llm: new AnthropicLlmClient(),
    prompt: await loadPrompt(EXAMPLE_PROMPTS_DIR, 'generate-lies'),
    budget: new Budget(DEFAULT_GENERATE_BUDGET_USD),
    count: input.count,
  });
  return records.flatMap((r) => r.accepted);
};
