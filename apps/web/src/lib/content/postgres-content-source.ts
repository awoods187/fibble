import type { PuzzleStore } from '@fibble/db';
import { isValidDateString, type Puzzle } from '@fibble/shared';
import type { ContentSource } from './content-source';

/**
 * Reads published days from Postgres (ADR 0012). The app connects as `fibble_reader`,
 * which can only SELECT, and the nightly job publishes today through today + 3, so the
 * date gate (not this class) decides what players see. No archive in production.
 */
export class PostgresContentSource implements ContentSource {
  readonly allowArchive = false;

  constructor(private readonly store: PuzzleStore) {}

  async getPuzzle(date: string): Promise<Puzzle | null> {
    // Validate before querying, as the file source does before touching the filesystem.
    if (!isValidDateString(date)) return null;
    return this.store.getPuzzle(date);
  }

  listDates(): Promise<string[]> {
    return this.store.listDates();
  }
}
