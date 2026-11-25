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
