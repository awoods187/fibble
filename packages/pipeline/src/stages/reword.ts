import { Budget, AnthropicLlmClient } from '../llm';
import { EXAMPLE_PROMPTS_DIR, loadPrompt } from '../prompts';
import { rewordCandidates } from '../reword/run';
import type { Candidate, RewordedTruth, Stage } from '../types';

/** Default spend cap for one call of this stage, in US dollars. */
export const DEFAULT_REWORD_BUDGET_USD = 1;

/**
 * Stage 2: extract one claim, rewrite it in house style, score it, and check entailment.
 * Uses the example prompts and a $1 cap; call rewordCandidates directly to choose
 * the prompts, the budget or the client, or to read rejections and stats.
 */
export const reword: Stage<Candidate[], RewordedTruth[]> = async (candidates, ctx) => {
  const { accepted } = await rewordCandidates(candidates, ctx, {
    llm: new AnthropicLlmClient(),
    prompts: {
      reword: await loadPrompt(EXAMPLE_PROMPTS_DIR, 'reword'),
      entailment: await loadPrompt(EXAMPLE_PROMPTS_DIR, 'entailment'),
    },
    budget: new Budget(DEFAULT_REWORD_BUDGET_USD),
  });
  return accepted;
};
