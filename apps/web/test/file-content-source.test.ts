import { describe, expect, it } from 'vitest';
import { FileContentSource } from '@/lib/content/file-content-source';
import { getTodaysPublicPuzzle } from '@/lib/todays-puzzle';
import { allKeys, exampleSource, FORBIDDEN_KEYS, productionLikeSource } from './helpers';

describe('FileContentSource', () => {
  it('lists the sample dates in order', async () => {
    expect(await exampleSource().listDates()).toEqual(['2026-11-24', '2026-11-25', '2026-11-26']);
  });

  it('reads and validates a day', async () => {
    const puzzle = await exampleSource().getPuzzle('2026-11-24');
    expect(puzzle?.sample).toBe(true);
    expect(puzzle?.rounds).toHaveLength(5);
  });

  it('returns null for a missing day', async () => {
    expect(await exampleSource().getPuzzle('2030-01-01')).toBeNull();
  });

  it('never treats a non-date as a path', async () => {
    expect(await exampleSource().getPuzzle('../package')).toBeNull();
  });

  it('exposes its archive setting', () => {
    expect(new FileContentSource('/nowhere', false).allowArchive).toBe(false);
  });
});

describe('getTodaysPublicPuzzle', () => {
  it("returns today's puzzle without answers", async () => {
    const pub = await getTodaysPublicPuzzle(exampleSource(), new Date('2026-11-25T12:00:00Z'), {
      fallbackToFirstSample: false,
    });
    expect(pub?.date).toBe('2026-11-25');
    const keys = allKeys(pub);
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k)).toBe(false);
  });

  it('falls back to the first sample day when asked', async () => {
    const pub = await getTodaysPublicPuzzle(
      productionLikeSource(),
      new Date('2027-06-01T12:00:00Z'),
      {
        fallbackToFirstSample: true,
      },
    );
    expect(pub?.date).toBe('2026-11-24');
  });

  it('returns null with no puzzle and no fallback', async () => {
    const pub = await getTodaysPublicPuzzle(
      productionLikeSource(),
      new Date('2027-06-01T12:00:00Z'),
      {
        fallbackToFirstSample: false,
      },
    );
    expect(pub).toBeNull();
  });
});
