import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORIES, PuzzleSchema, type Round } from '@fibble/shared';
import { describe, expect, it } from 'vitest';
import type { ApprovedRound } from '../review/schemas';
import { balancedLieIndexes, buildDays, moveLie, nextDates } from './build';

const sample = (date: string) =>
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, `../../../../content-example/${date}.json`), 'utf8'),
  ) as { rounds: Round[] };
// Three sample days give three real-format rounds per category.
const DAYS = ['2026-11-24', '2026-11-25', '2026-11-26'].map(sample);
const NOW = new Date('2026-11-25T12:00:00Z');

function approved(dayIdx: number, catIdx: number): ApprovedRound {
  // The placeholder days cite one article everywhere; give each truth its own, as real rounds do.
  const base = DAYS[dayIdx]!.rounds[catIdx]!;
  // Placeholder texts are near-identical; give each statement its own words (80-160 chars).
  const words = (n: string) =>
    ['amber', 'brine', 'cobalt', 'delta', 'ember', 'fjord'].map((w) => `${w}${n}`).join(' ');
  const round: Round = {
    ...base,
    statements: base.statements
      .map((st, i) => ({
        ...st,
        text: `Fixture ${dayIdx}${catIdx}${i}: ${words(`${dayIdx}${catIdx}${i}`)} and more.`.padEnd(
          90,
          '.',
        ),
      }))
      .map((st, i) =>
        st.source
          ? {
              ...st,
              source: {
                ...st.source,
                title: `${st.source.title} ${dayIdx}${catIdx}${i}`,
                url: `${st.source.url}_${dayIdx}${catIdx}${i}`,
              },
            }
          : st,
      ),
  };
  return {
    roundId: `r-${dayIdx}-${catIdx}`,
    round,
    truthIds: [`t${dayIdx}${catIdx}a`, `t${dayIdx}${catIdx}b`],
    lieId: `lie-${dayIdx}-${catIdx}`,
    sourceTitles: round.statements.flatMap((s) => (s.source ? [s.source.title] : [])),
    reviewSetId: 'review-x',
    reviewedBy: 'Andy',
    reviewedAt: '2026-11-25T20:00:00.000Z',
  };
}
const ALL = [0, 1, 2].flatMap((d) => [0, 1, 2, 3, 4].map((c) => approved(d, c)));
const input = (over: Partial<Parameters<typeof buildDays>[0]> = {}) =>
  ({
    approved: ALL,
    existingDates: [],
    usedArticles: new Set<string>(),
    count: 7,
    seed: 's',
    now: NOW,
    ...over,
  }) as Parameters<typeof buildDays>[0];

describe('buildDays', () => {
  it('builds full days in the fixed category order, today first, numbered from launch', () => {
    const { days, stoppedBecause } = buildDays(input());
    expect(days).toHaveLength(3);
    for (const d of days) {
      expect(PuzzleSchema.safeParse(d.puzzle).success).toBe(true);
      expect(d.puzzle.rounds.map((r) => r.category)).toEqual(CATEGORIES.map((c) => c.name));
    }
    expect(days.map((d) => [d.puzzle.date, d.puzzle.puzzleNumber])).toEqual([
      ['2026-11-25', 1],
      ['2026-11-26', 2],
      ['2026-11-27', 3],
    ]);
    expect(stoppedBecause).toMatch(/ran out/);
  });

  it('continues after the existing bank, numbered from the launch date', () => {
    const { days } = buildDays(input({ existingDates: ['2026-12-01', '2026-12-02'], count: 1 }));
    expect(days[0]?.puzzle).toMatchObject({ date: '2026-12-03', puzzleNumber: 9 });
  });

  it('refuses to build a day before launch', () => {
    expect(() => buildDays(input({ start: '2026-11-20' }))).toThrow(/before launch/);
  });

  it('skips a round whose statement nearly repeats one already in the bank', () => {
    const repeat = ALL[0]!.round.statements[0]!.text;
    const { leftover } = buildDays(input({ bankTexts: [repeat] }));
    expect(leftover).toContainEqual({
      roundId: 'r-0-0',
      category: 'History',
      reason: 'a statement is too similar to one in the bank',
    });
  });

  it('never reuses an article already in the bank', () => {
    const used = new Set(ALL[0]!.sourceTitles);
    const { days, leftover } = buildDays(input({ usedArticles: used }));
    const titles = days.flatMap((d) =>
      d.puzzle.rounds.flatMap((r) => r.statements.map((s) => s.source?.title)),
    );
    for (const t of used) expect(titles).not.toContain(t);
    expect(leftover).toContainEqual({
      roundId: 'r-0-0',
      category: 'History',
      reason: 'uses an article already in the bank',
    });
  });

  it('stops when a category runs out, and leaves the rest over', () => {
    const noGeography = ALL.filter((r) => r.round.category !== 'Geography & Places');
    const { days, leftover, stoppedBecause } = buildDays(input({ approved: noGeography }));
    expect(days).toEqual([]);
    expect(stoppedBecause).toMatch(/Geography & Places/);
    expect(leftover).toHaveLength(noGeography.length);
  });

  it('respects the requested count', () => {
    expect(buildDays(input({ count: 2 })).days).toHaveLength(2);
  });

  it('spreads the lie across cards 1–3 evenly over the batch', () => {
    const { days } = buildDays(input());
    const positions = days.flatMap((d) => d.puzzle.rounds.map((r) => r.lieIndex));
    expect([0, 1, 2].map((p) => positions.filter((x) => x === p).length)).toEqual([5, 5, 5]);
  });
});

describe('helpers', () => {
  const round = DAYS[0]!.rounds[0]!;

  it('moveLie moves only the lie; truths keep their order', () => {
    const target = ((round.lieIndex + 1) % 3) as 0 | 1 | 2;
    const moved = moveLie(round, target);
    expect(moved.lieIndex).toBe(target);
    expect(moved.statements[target]).toEqual(round.statements[round.lieIndex]);
    expect(moved.statements.filter((_, i) => i !== target)).toEqual(
      round.statements.filter((_, i) => i !== round.lieIndex),
    );
    expect(moveLie(round, round.lieIndex)).toBe(round);
  });

  it('balancedLieIndexes is even and seeded', () => {
    const p = balancedLieIndexes(12, 's');
    expect([0, 1, 2].map((i) => p.filter((x) => x === i).length)).toEqual([4, 4, 4]);
    expect(balancedLieIndexes(12, 's')).toEqual(p);
  });

  it('nextDates skips taken dates', () => {
    expect(nextDates(['2026-11-27'], '2026-11-26', NOW, 3)).toEqual([
      '2026-11-26',
      '2026-11-28',
      '2026-11-29',
    ]);
    // Empty bank: today, but never before launch.
    expect(nextDates([], undefined, NOW, 1)).toEqual(['2026-11-25']);
    expect(nextDates([], undefined, new Date('2026-11-01T00:00:00Z'), 1)).toEqual(['2026-11-25']);
  });
});
