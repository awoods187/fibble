import {
  AnswerResultSchema,
  PublicPuzzleSchema,
  type AnswerResult,
  type LieIndex,
  type PublicPuzzle,
  type Puzzle,
  type Round,
} from './schema';

/**
 * Strip every answer field from a puzzle. Fields are copied explicitly
 * (an allow-list), so a new answer field added to the schema can never
 * leak by default. The result is parsed with a strict schema as a backstop.
 */
export function toPublicPuzzle(puzzle: Puzzle): PublicPuzzle {
  return PublicPuzzleSchema.parse({
    ...(puzzle.sample !== undefined ? { sample: puzzle.sample } : {}),
    date: puzzle.date,
    puzzleNumber: puzzle.puzzleNumber,
    rounds: puzzle.rounds.map((round, i) => ({
      round: i + 1,
      category: round.category,
      difficulty: round.difficulty,
      statements: round.statements.map((s) => ({ text: s.text })),
    })),
  });
}

/** Grade a choice and reveal the round's answers. `roundNumber` is 1-based. */
export function buildAnswerResult(
  round: Round,
  roundNumber: number,
  choice: LieIndex,
): AnswerResult {
  const truths = round.statements.flatMap((s, i) =>
    i === round.lieIndex ? [] : [{ index: i, expansion: s.expansion, source: s.source }],
  );
  return AnswerResultSchema.parse({
    round: roundNumber,
    choice,
    correct: choice === round.lieIndex,
    lieIndex: round.lieIndex,
    lieNote: round.lieNote,
    truths,
  });
}
