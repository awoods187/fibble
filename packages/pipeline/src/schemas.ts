import { SourceSchema } from '@fibble/shared';
import { z } from 'zod';
import { MODELS, type ModelId } from './models';

/**
 * Zod schemas for pipeline records that are written to disk and read back by a
 * later stage. Types are inferred from these; see types.ts for the rest.
 */

const MODEL_IDS = [...new Set(Object.values(MODELS))] as [ModelId, ...ModelId[]];

export const StageNameSchema = z.enum([
  'harvest',
  'reword',
  'generateLies',
  'verify',
  'assemble',
  'dedupe',
  'review',
]);

export const TraceSchema = z.strictObject({
  stage: StageNameSchema,
  promptVersion: z.string().min(1),
  model: z.enum(MODEL_IDS).optional(),
  createdAt: z.iso.datetime(),
});

export const HarvestSourceSchema = z.enum(['dyk', 'unusual-articles']);

/** A DYK archive month, as YYYY-MM. */
export const HarvestMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Expected a month as YYYY-MM' });

export const CandidateSchema = z.strictObject({
  /** Stable across re-runs: source, month and a hash of the hook text. */
  id: z.string().min(1),
  harvestedFrom: HarvestSourceSchema,
  /** The archive month the hook came from (YYYY-MM). */
  month: HarvestMonthSchema,
  /** The raw hook or claim, as plain text from Wikipedia. Never shipped as-is. */
  rawClaim: z.string().min(1),
  /** The hook's bolded subject article, at the revision we read. */
  article: SourceSchema,
  /** The article's lead plus the section that best matches the hook. Evidence for later stages. */
  contextText: z.string().min(1),
  /** True if any person linked in the hook is living, per Wikidata. Stage 2 rejects these. */
  involvesLivingPerson: z.boolean(),
  /** Titles of the linked articles that made involvesLivingPerson true. */
  livingPeople: z.array(z.string()),
  trace: TraceSchema,
});
