import { z } from 'zod';
import { CATEGORIES, CATEGORY_NAMES, ROUNDS_PER_PUZZLE, STATEMENTS_PER_ROUND } from './categories';
import { isValidDateString } from './dates';

/**
 * The Zod schemas in this file are the source of truth for puzzle data.
 * Types are inferred from them; never hand-write a parallel interface.
 */

export const STATEMENT_MIN_LENGTH = 80;
export const STATEMENT_MAX_LENGTH = 160;
export const EXPANSION_MAX_LENGTH = 300;

/** A calendar date as YYYY-MM-DD. */
export const PuzzleDateSchema = z
  .string()
  .refine(isValidDateString, { message: 'Expected a real calendar date as YYYY-MM-DD' });

export const SourceSchema = z.strictObject({
  /** Wikipedia article title, shown as "Source: Wikipedia, <title>". */
  title: z.string().min(1),
  url: z.url({ protocol: /^https$/ }),
  /** The article revision the fact was checked against. */
  revisionId: z.int().positive(),
});

/** Exactly one sentence: no sentence break followed by more text. */
const oneSentence = z
  .string()
  .trim()
  .min(1)
  .max(EXPANSION_MAX_LENGTH)
  .refine((s) => !/[.!?]\s+[A-Z]/.test(s), { message: 'Expansion must be a single sentence' });

/**
 * One card. Truths carry `expansion` and `source`; the lie carries neither
 * (its explanation is the round's `lieNote`). That rule is enforced on Round,
 * which is the only place that knows which statement is the lie.
 */
export const StatementSchema = z.strictObject({
  text: z.string().trim().min(STATEMENT_MIN_LENGTH).max(STATEMENT_MAX_LENGTH),
  expansion: oneSentence.optional(),
  source: SourceSchema.optional(),
});

export const LieIndexSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const RoundSchema = z
  .strictObject({
    category: z.enum(CATEGORY_NAMES),
    difficulty: z.int().min(1).max(5),
    statements: z.array(StatementSchema).length(STATEMENTS_PER_ROUND),
    lieIndex: LieIndexSchema,
    /** The "why it sounded true" line shown on the FIB card. */
    lieNote: z.string().trim().min(1).max(EXPANSION_MAX_LENGTH),
  })
  .superRefine((round, ctx) => {
    round.statements.forEach((statement, i) => {
      const isLie = i === round.lieIndex;
      if (isLie) {
        if (statement.source !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['statements', i, 'source'],
            message: 'The lie must not have a source',
          });
        }
        if (statement.expansion !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['statements', i, 'expansion'],
            message: 'The lie must not have an expansion; use lieNote',
          });
        }
      } else {
        if (statement.source === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['statements', i, 'source'],
            message: 'Every truth must have a source',
          });
        }
        if (statement.expansion === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['statements', i, 'expansion'],
            message: 'Every truth must have an expansion',
          });
        }
      }
    });
  });

export const PuzzleSchema = z
  .strictObject({
    /** Present and true only on the public example content. */
    sample: z.boolean().optional(),
    date: PuzzleDateSchema,
    puzzleNumber: z.int().positive(),
    rounds: z.array(RoundSchema).length(ROUNDS_PER_PUZZLE),
  })
  .superRefine((puzzle, ctx) => {
    puzzle.rounds.forEach((round, i) => {
      const expected = CATEGORIES[i]?.name;
      if (round.category !== expected) {
        ctx.addIssue({
          code: 'custom',
          path: ['rounds', i, 'category'],
          message: `Round ${i + 1} must be "${expected}", got "${round.category}"`,
        });
      }
    });
  });

/* ---------- What the client is allowed to see ---------- */

export const PublicStatementSchema = z.strictObject({
  text: StatementSchema.shape.text,
});

export const PublicRoundSchema = z.strictObject({
  /** 1-based round number, used in the answer URL. */
  round: z.int().min(1).max(ROUNDS_PER_PUZZLE),
  category: z.enum(CATEGORY_NAMES),
  difficulty: z.int().min(1).max(5),
  statements: z.array(PublicStatementSchema).length(STATEMENTS_PER_ROUND),
});

/** The puzzle as served by GET /api/puzzle/[date]: no answers, notes or sources. */
export const PublicPuzzleSchema = z.strictObject({
  sample: z.boolean().optional(),
  date: PuzzleDateSchema,
  puzzleNumber: z.int().positive(),
  rounds: z.array(PublicRoundSchema).length(ROUNDS_PER_PUZZLE),
});

/* ---------- Answer endpoint ---------- */

export const AnswerRequestSchema = z.strictObject({
  choice: LieIndexSchema,
});

export const RevealedTruthSchema = z.strictObject({
  index: LieIndexSchema,
  expansion: z.string(),
  source: SourceSchema,
});

/** Returned by POST /api/puzzle/[date]/round/[n]/answer once a choice is made. */
export const AnswerResultSchema = z.strictObject({
  round: z.int().min(1).max(ROUNDS_PER_PUZZLE),
  choice: LieIndexSchema,
  correct: z.boolean(),
  lieIndex: LieIndexSchema,
  lieNote: z.string(),
  truths: z.array(RevealedTruthSchema).length(STATEMENTS_PER_ROUND - 1),
});

export type PuzzleDate = z.infer<typeof PuzzleDateSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Statement = z.infer<typeof StatementSchema>;
export type LieIndex = z.infer<typeof LieIndexSchema>;
export type Round = z.infer<typeof RoundSchema>;
export type Puzzle = z.infer<typeof PuzzleSchema>;
export type PublicStatement = z.infer<typeof PublicStatementSchema>;
export type PublicRound = z.infer<typeof PublicRoundSchema>;
export type PublicPuzzle = z.infer<typeof PublicPuzzleSchema>;
export type AnswerRequest = z.infer<typeof AnswerRequestSchema>;
export type RevealedTruth = z.infer<typeof RevealedTruthSchema>;
export type AnswerResult = z.infer<typeof AnswerResultSchema>;
