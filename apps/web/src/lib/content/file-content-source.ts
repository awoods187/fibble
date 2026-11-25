import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isValidDateString, PuzzleSchema, type Puzzle } from '@fibble/shared';
import type { ContentSource } from './content-source';

const FILE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

/** Reads one YYYY-MM-DD.json file per day from a folder, validating each with the shared schema. */
export class FileContentSource implements ContentSource {
  constructor(
    private readonly dir: string,
    readonly allowArchive: boolean,
  ) {}

  async getPuzzle(date: string): Promise<Puzzle | null> {
    // Validate before touching the filesystem, so `date` can never be a path.
    if (!isValidDateString(date)) return null;
    let raw: string;
    try {
      raw = await readFile(join(this.dir, `${date}.json`), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    return PuzzleSchema.parse(JSON.parse(raw));
  }

  async listDates(): Promise<string[]> {
    const files = await readdir(this.dir);
    return files
      .map((f) => FILE_RE.exec(f)?.[1])
      .filter((d): d is string => d !== undefined && isValidDateString(d))
      .sort();
  }
}
