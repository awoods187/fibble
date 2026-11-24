import { toPublicPuzzle, utcDateString, type PublicPuzzle } from '@fibble/shared';
import type { ContentSource } from './content';
import { getPlayablePuzzle } from './puzzle-service';

/**
 * Today's puzzle, as public data only (no answers). Uses the UTC date until
 * the client sends its local date. In development, falls back to the first
 * sample day so the page always has something to show.
 */
export async function getTodaysPublicPuzzle(
  source: ContentSource,
  now: Date,
  { fallbackToFirstSample }: { fallbackToFirstSample: boolean },
): Promise<PublicPuzzle | null> {
  const today = await getPlayablePuzzle(source, utcDateString(now), now);
  if (today.ok) return toPublicPuzzle(today.puzzle);
  if (!fallbackToFirstSample) return null;
  const [first] = await source.listDates();
  if (!first) return null;
  const fallback = await source.getPuzzle(first);
  return fallback?.sample ? toPublicPuzzle(fallback) : null;
}
