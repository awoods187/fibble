import { type Puzzle, PuzzleSchema } from '@fibble/shared';

/**
 * Published puzzle days in Postgres (ADR 0012). The store depends only on a tagged-template
 * SQL function, so tests pass a fake and the real one comes from the Neon driver.
 *
 * Roles: the app connects as `fibble_reader` (SELECT only); the publish job as
 * `fibble_publisher` (SELECT, INSERT, UPDATE; never DELETE). See migrations/0001_puzzles.sql.
 */

export type Row = Record<string, unknown>;
/** A tagged-template query function, as returned by `neon(url)`. Values become bind parameters. */
export type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>;

export interface StoredDay {
  date: string;
  puzzle: Puzzle;
}

/** Postgres DATE out as text, so time zones can never shift a day. */
const asDateString = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Unexpected date from the database: ${String(value)}`);
  }
  return value;
};

export class PuzzleStore {
  constructor(private readonly sql: Sql) {}

  /** The puzzle for a date, re-validated against the schema, or null. */
  async getPuzzle(date: string): Promise<Puzzle | null> {
    const rows = await this.sql`SELECT puzzle FROM puzzles WHERE date = ${date}::date`;
    const row = rows[0];
    if (!row) return null;
    const parsed = PuzzleSchema.safeParse(row.puzzle);
    if (!parsed.success) throw new Error(`Puzzle ${date} in the database fails the schema`);
    return parsed.data;
  }

  /** Every published date, ascending. */
  async listDates(): Promise<string[]> {
    const rows = await this
      .sql`SELECT to_char(date, 'YYYY-MM-DD') AS date FROM puzzles ORDER BY date`;
    return rows.map((r) => asDateString(r.date));
  }

  /** Stored puzzles for some dates, keyed by date (to compare before publishing). */
  async getDays(dates: string[]): Promise<Map<string, unknown>> {
    if (!dates.length) return new Map();
    const rows = await this.sql`
      SELECT to_char(date, 'YYYY-MM-DD') AS date, puzzle FROM puzzles
      WHERE date = ANY(${dates}::date[])`;
    return new Map(rows.map((r) => [asDateString(r.date), r.puzzle]));
  }

  /** Insert or replace one day. Needs the publisher role. */
  async upsert(day: StoredDay): Promise<void> {
    await this.sql`
      INSERT INTO puzzles (date, puzzle) VALUES (${day.date}::date, ${JSON.stringify(day.puzzle)}::jsonb)
      ON CONFLICT (date) DO UPDATE SET puzzle = EXCLUDED.puzzle, updated_at = now()`;
  }
}
