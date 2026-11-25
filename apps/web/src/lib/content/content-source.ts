import type { Puzzle } from '@fibble/shared';

/**
 * Where puzzles come from. The app depends only on this interface.
 *
 * - FileContentSource reads content-example/ (local dev and tests).
 * - A Postgres implementation will read published days in production.
 *
 * A ContentSource returns full puzzles, answers included. It must only be
 * used on the server; route handlers strip answers before responding.
 */
export interface ContentSource {
  /** The puzzle for a date, or null if there is none. Does not apply date gating. */
  getPuzzle(date: string): Promise<Puzzle | null>;
  /** All dates this source holds, sorted ascending. */
  listDates(): Promise<string[]>;
  /** Whether dates more than 1 day old may be served (archive access). */
  readonly allowArchive: boolean;
}
