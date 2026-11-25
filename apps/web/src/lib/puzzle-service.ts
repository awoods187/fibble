import {
  AnswerRequestSchema,
  buildAnswerResult,
  isDateArchived,
  isDateReleased,
  isValidDateString,
  ROUNDS_PER_PUZZLE,
  toPublicPuzzle,
  type Puzzle,
} from '@fibble/shared';
import type { ContentSource } from './content';

/**
 * Server-side puzzle access with date gating. Every route goes through
 * getPlayablePuzzle, so the gate can't be skipped by one endpoint.
 */

export type Lookup = { ok: true; puzzle: Puzzle } | { ok: false; status: 400 | 404; error: string };

export async function getPlayablePuzzle(
  source: ContentSource,
  date: string,
  now: Date,
): Promise<Lookup> {
  if (!isValidDateString(date)) {
    return { ok: false, status: 400, error: 'Date must be a real date as YYYY-MM-DD' };
  }
  // Unreleased and missing dates get the same 404, so the API never reveals
  // whether a future puzzle exists.
  const notFound = { ok: false, status: 404, error: 'No puzzle for this date' } as const;
  if (!isDateReleased(date, now)) return notFound;
  if (!source.allowArchive && isDateArchived(date, now)) return notFound;
  const puzzle = await source.getPuzzle(date);
  return puzzle ? { ok: true, puzzle } : notFound;
}

/** Answer bodies are { "choice": n }; anything bigger is abuse, not a player. */
export const MAX_ANSWER_BODY_BYTES = 1024;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** GET /api/puzzle/[date] */
export async function handleGetPuzzle(source: ContentSource, date: string, now: Date) {
  const lookup = await getPlayablePuzzle(source, date, now);
  if (!lookup.ok) return json({ error: lookup.error }, lookup.status);
  return json(toPublicPuzzle(lookup.puzzle));
}

/** POST /api/puzzle/[date]/round/[n]/answer */
export async function handleAnswer(
  source: ContentSource,
  date: string,
  n: string,
  request: Request,
  now: Date,
) {
  const round = /^[1-9]\d*$/.test(n) ? Number(n) : NaN;
  if (!(round >= 1 && round <= ROUNDS_PER_PUZZLE)) {
    return json({ error: `Round must be 1 to ${ROUNDS_PER_PUZZLE}` }, 400);
  }
  // A valid body is ~12 bytes. Refuse anything large before reading it all.
  const tooLarge = json({ error: `Body must be under ${MAX_ANSWER_BODY_BYTES} bytes` }, 413);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_ANSWER_BODY_BYTES) return tooLarge;
  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_ANSWER_BODY_BYTES) return tooLarge;
    body = JSON.parse(text);
  } catch {
    return json({ error: 'Body must be JSON: { "choice": 0 | 1 | 2 }' }, 400);
  }
  const parsed = AnswerRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Body must be JSON: { "choice": 0 | 1 | 2 }' }, 400);
  }
  const lookup = await getPlayablePuzzle(source, date, now);
  if (!lookup.ok) return json({ error: lookup.error }, lookup.status);
  const target = lookup.puzzle.rounds[round - 1];
  if (!target) return json({ error: 'No such round' }, 404);
  return json(buildAnswerResult(target, round, parsed.data.choice));
}
