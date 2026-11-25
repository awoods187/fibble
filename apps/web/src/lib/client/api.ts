import {
  type AnswerResult,
  AnswerResultSchema,
  type LieIndex,
  type PublicPuzzle,
  PublicPuzzleSchema,
} from '@fibble/shared';

/**
 * The browser's calls to the game API. Every response is validated with the shared schema,
 * so a malformed or unexpected reply fails loudly instead of rendering nonsense.
 */

export type PuzzleFetch = { ok: true; puzzle: PublicPuzzle } | { ok: false; status: number };

export async function fetchPuzzle(date: string): Promise<PuzzleFetch> {
  const res = await fetch(`/api/puzzle/${date}`, { cache: 'no-store' });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, puzzle: PublicPuzzleSchema.parse(await res.json()) };
}

/** Send the chosen lie for a round (1-based) and get the reveal. */
export async function submitAnswer(
  date: string,
  round: number,
  choice: LieIndex,
): Promise<AnswerResult> {
  const res = await fetch(`/api/puzzle/${date}/round/${round}/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ choice }),
  });
  if (!res.ok) throw new Error(`The answer couldn't be checked (HTTP ${res.status})`);
  return AnswerResultSchema.parse(await res.json());
}
