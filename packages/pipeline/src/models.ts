/**
 * Which Claude model runs each pipeline stage (PRD section 5, "Models and cost").
 * See docs/adr/0004-model-per-stage.md for the reasoning.
 *
 * The verification judge deliberately uses a different model from the lie
 * generator, so a single model's blind spot can't both write and approve a lie.
 */
export const MODELS = {
  /** Opus: hardest creative work, where quality matters most. */
  generateLies: 'claude-opus-5-5',
  /** Opus: does the source support every detail of the reworded truth? */
  entailment: 'claude-opus-5-5',
  /** Sonnet: reads retrieved evidence and labels a lie supported / contradicted / no evidence. */
  verifyJudge: 'claude-sonnet-5-5',
  /** Haiku: high-volume, low-stakes tagging (category, entities). */
  classify: 'claude-haiku-5-5',
  /** Haiku: first-draft rewording of harvested claims into house style. */
  rewordDraft: 'claude-haiku-5-5',
  /** Haiku: guesses the lie 10 times per round to catch lies detectable by style alone. */
  styleSpotter: 'claude-haiku-5-5',
} as const;

export type PipelineTask = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[PipelineTask];

/** Style-spotter settings from PRD section 5, stage 5. */
export const STYLE_SPOTTER = {
  samples: 10,
  /** Regenerate the lie if the spotter finds it more often than this. */
  maxDetectionRate: 0.7,
} as const;

/** Dedupe thresholds from PRD section 5, stage 6. */
export const DEDUPE = {
  maxCosineSimilarity: 0.85,
  articleReuseDays: 365,
  entityReuseDays: 90,
} as const;

/**
 * List prices in US dollars per million tokens (Claude API, 2026-11). Used only to
 * estimate and cap pipeline spend; the Console's usage page is the source of truth.
 * Cache writes cost 1.25x input; cache reads are listed per model.
 */
export const PRICES: Record<ModelId, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

/** Estimated cost of one call. Output tokens include thinking. */
export function estimateCostUsd(model: ModelId, usage: TokenUsage): number {
  const p = PRICES[model];
  return (
    (usage.inputTokens * p.input +
      usage.cacheCreationTokens * p.input * 1.25 +
      usage.cacheReadTokens * p.cacheRead +
      usage.outputTokens * p.output) /
    1_000_000
  );
}
