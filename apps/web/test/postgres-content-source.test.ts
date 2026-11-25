import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PuzzleStore, type Sql } from '@fibble/db';
import { describe, expect, it } from 'vitest';
import { chooseContentSource, FileContentSource, PostgresContentSource } from '@/lib/content';
import { handleGetPuzzle } from '@/lib/puzzle-service';
import { allKeys, FORBIDDEN_KEYS } from './helpers';

const SAMPLE = resolve(import.meta.dirname, '../../../content-example/2026-11-24.json');

function fakeStore(rows: Record<string, unknown>[]) {
  const queries: unknown[][] = [];
  const sql: Sql = async (_strings, ...values) => {
    queries.push(values);
    return rows;
  };
  return { store: new PuzzleStore(sql), queries };
}

describe('PostgresContentSource', () => {
  it('reads a day from the store and never allows the archive', async () => {
    const puzzle = JSON.parse(await readFile(SAMPLE, 'utf8'));
    const { store } = fakeStore([{ puzzle }]);
    const source = new PostgresContentSource(store);
    expect(source.allowArchive).toBe(false);
    expect((await source.getPuzzle('2026-11-24'))?.rounds).toHaveLength(5);
  });

  it('rejects a malformed date without querying', async () => {
    const { store, queries } = fakeStore([]);
    expect(
      await new PostgresContentSource(store).getPuzzle("2026-11-24'; DROP TABLE puzzles;--"),
    ).toBeNull();
    expect(queries).toEqual([]);
  });
});

describe('chooseContentSource', () => {
  it('uses Postgres when DATABASE_URL is set, and files otherwise', () => {
    expect(
      chooseContentSource({ DATABASE_URL: 'postgresql://u:password@h.example/db' }),
    ).toBeInstanceOf(PostgresContentSource);
    expect(chooseContentSource({})).toBeInstanceOf(FileContentSource);
  });

  it('refuses an unresolved 1Password reference instead of trying to connect', () => {
    expect(() => chooseContentSource({ DATABASE_URL: 'op://Private/x/y' })).toThrow(/op run/);
  });
});

describe('API on a Postgres source', () => {
  it('still strips every answer field', async () => {
    const puzzle = JSON.parse(await readFile(SAMPLE, 'utf8'));
    const source = new PostgresContentSource(fakeStore([{ puzzle }]).store);
    const res = await handleGetPuzzle(source, '2026-11-24', new Date('2026-11-24T12:00:00Z'));
    const body = await res.json();
    expect(res.status).toBe(200);
    for (const key of FORBIDDEN_KEYS) expect(allKeys(body).has(key)).toBe(false);
  });
});
