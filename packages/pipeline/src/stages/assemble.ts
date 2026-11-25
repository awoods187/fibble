import { assembleRounds } from '../assemble/run';
import type { GenerationRecord } from '../generate/schemas';
import { AnthropicLlmClient, Budget } from '../llm';
import { EXAMPLE_PROMPTS_DIR, loadPrompt } from '../prompts';
import type { CandidateRound, RewordedTruth, Stage, VerifiedLie } from '../types';

export interface AssembleInput {
  truths: RewordedTruth[];
  records: GenerationRecord[];
  verified: VerifiedLie[];
}

/** Default spend cap for one call of this stage, in US dollars. */
export const DEFAULT_ASSEMBLE_BUDGET_USD = 1;

/**
 * Stage 5: score each verified lie with the style spotter and heuristics, choose the
 * hardest to spot per truth pair, and write rounds in the shared puzzle format.
 * Call assembleRounds directly for the rounds that couldn't be assembled and why.
 */
export const assemble: Stage<AssembleInput, CandidateRound[]> = async (input, ctx) => {
  const { rounds } = await assembleRounds(input.truths, input.records, input.verified, ctx, {
    llm: new AnthropicLlmClient(),
    prompt: await loadPrompt(EXAMPLE_PROMPTS_DIR, 'style-spotter'),
    budget: new Budget(DEFAULT_ASSEMBLE_BUDGET_USD),
  });
  return rounds;
};
