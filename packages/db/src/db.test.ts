import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkRole, problems, type RoleReport } from './check';
import { MissingSecretError, readSecret } from './connect';
import { PuzzleStore, type Row, type Sql } from './store';

const SAMPLE = resolve(import.meta.dirname, '../../../content-example/2026-11-24.json');

/** A fake SQL function: records each query and answers from a queue. */
function fakeSql(answers: Row[][]) {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql: Sql = async (strings, ...values) => {
    calls.push({ text: strings.join('$').replace(/\s+/g, ' ').trim(), values });
    return answers.shift() ?? [];
  };
  return { sql, calls };
}

describe('PuzzleStore', () => {
  it('reads a puzzle by date as a bind parameter, and re-validates it', async () => {
    const puzzle = JSON.parse(await readFile(SAMPLE, 'utf8'));
    const { sql, calls } = fakeSql([[{ puzzle }]]);
    const got = await new PuzzleStore(sql).getPuzzle('2026-11-24');
    expect(got?.date).toBe('2026-11-24');
    expect(calls[0]).toEqual({
      text: 'SELECT puzzle FROM puzzles WHERE date = $::date',
      values: ['2026-11-24'],
    });
  });

  it('returns null for a missing day', async () => {
    const { sql } = fakeSql([[]]);
    expect(await new PuzzleStore(sql).getPuzzle('2026-01-01')).toBeNull();
  });

  it('refuses a stored puzzle that fails the schema', async () => {
    const { sql } = fakeSql([[{ puzzle: { date: '2026-11-24', rounds: [] } }]]);
    await expect(new PuzzleStore(sql).getPuzzle('2026-11-24')).rejects.toThrow(/fails the schema/);
  });

  it('lists dates as plain YYYY-MM-DD text, never Date objects', async () => {
    const { sql } = fakeSql([[{ date: '2026-11-24' }, { date: '2026-11-25' }]]);
    expect(await new PuzzleStore(sql).listDates()).toEqual(['2026-11-24', '2026-11-25']);
    const bad = fakeSql([[{ date: new Date('2026-11-24') }]]);
    await expect(new PuzzleStore(bad.sql).listDates()).rejects.toThrow(/Unexpected date/);
  });

  it('upserts a day with the puzzle as a JSON parameter, never spliced into SQL', async () => {
    const { sql, calls } = fakeSql([[]]);
    const puzzle = JSON.parse(await readFile(SAMPLE, 'utf8'));
    await new PuzzleStore(sql).upsert({ date: '2026-11-24', puzzle });
    expect(calls[0]?.text).toMatch(
      /^INSERT INTO puzzles \(date, puzzle\) VALUES \(\$::date, \$::jsonb\) ON CONFLICT \(date\) DO UPDATE/,
    );
    expect(calls[0]?.values).toEqual(['2026-11-24', JSON.stringify(puzzle)]);
  });

  it('fetches several days at once, and nothing for an empty list', async () => {
    const { sql, calls } = fakeSql([[{ date: '2026-11-24', puzzle: { x: 1 } }]]);
    const store = new PuzzleStore(sql);
    expect([...(await store.getDays(['2026-11-24', '2026-11-25']))]).toEqual([
      ['2026-11-24', { x: 1 }],
    ]);
    expect(await store.getDays([])).toEqual(new Map());
    expect(calls).toHaveLength(1);
  });
});

describe('readSecret', () => {
  it('returns a set value', () => {
    expect(readSecret('X', { X: ' postgresql://u:password@h/db ' })).toBe(
      'postgresql://u:password@h/db',
    );
  });

  it('fails clearly when unset or an unresolved 1Password reference', () => {
    expect(() => readSecret('X', {})).toThrow(MissingSecretError);
    expect(() => readSecret('X', { X: 'op://Private/item/field' })).toThrow(/op run/);
  });
});

describe('role checks', () => {
  const report = (over: Partial<RoleReport> = {}): RoleReport => ({
    role: 'fibble_reader',
    database: 'neondb',
    tableExists: true,
    privileges: { select: true, insert: false, update: false, delete: false },
    days: 0,
    ...over,
  });

  it('passes a correctly limited reader and publisher', () => {
    expect(problems(report(), 'fibble_reader')).toEqual([]);
    const publisher = report({
      role: 'fibble_publisher',
      privileges: { select: true, insert: true, update: true, delete: false },
    });
    expect(problems(publisher, 'fibble_publisher')).toEqual([]);
  });

  it('flags a reader that can write, a publisher that can delete, and the wrong role', () => {
    expect(
      problems(
        report({ privileges: { select: true, insert: true, update: false, delete: false } }),
        'fibble_reader',
      ),
    ).toEqual(['INSERT is allowed; it should not be']);
    const deleter = report({
      role: 'fibble_publisher',
      privileges: { select: true, insert: true, update: true, delete: true },
    });
    expect(problems(deleter, 'fibble_publisher')).toEqual(['DELETE is allowed; it should not be']);
    expect(problems(report({ role: 'neondb_owner' }), 'fibble_reader')[0]).toBe(
      'connected as neondb_owner, expected fibble_reader',
    );
  });

  it('reads role, table and privileges from the database', async () => {
    const { sql } = fakeSql([
      [{ role: 'fibble_reader', database: 'neondb', table_exists: true }],
      [{ select: true, insert: false, update: false, delete: false }],
      [{ days: 3 }],
    ]);
    expect(await checkRole(sql)).toEqual(report({ days: 3 }));
  });

  it('reports a missing table without querying it', async () => {
    const { sql, calls } = fakeSql([
      [{ role: 'fibble_reader', database: 'neondb', table_exists: false }],
    ]);
    const r = await checkRole(sql);
    expect(r.tableExists).toBe(false);
    expect(calls).toHaveLength(1);
    expect(problems(r, 'fibble_reader')).toContain(
      'the puzzles table does not exist (run migrations/0001_puzzles.sql)',
    );
  });
});
