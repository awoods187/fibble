import { describe, expect, it } from 'vitest';
import { CATEGORIES } from './categories';
import { PuzzleSchema, RoundSchema, StatementSchema } from './schema';
import { makePuzzle, makeRound } from './test/fixtures';

describe('CATEGORIES', () => {
  it('is in the PRD order with share emoji', () => {
    expect(CATEGORIES.map((c) => `${c.emoji} ${c.name}`)).toEqual([
      '🏛️ History',
      '🔬 Science & Nature',
      '🌍 Geography & Places',
      '🏆 Sports & Games',
      '🎬 Arts & Entertainment',
    ]);
  });
});

describe('StatementSchema', () => {
  it('rejects text shorter than 80 characters', () => {
    expect(StatementSchema.safeParse({ text: 'x'.repeat(79) }).success).toBe(false);
  });
  it('rejects text longer than 160 characters', () => {
    expect(StatementSchema.safeParse({ text: 'x'.repeat(161) }).success).toBe(false);
  });
  it('accepts text at both limits', () => {
    expect(StatementSchema.safeParse({ text: 'x'.repeat(80) }).success).toBe(true);
    expect(StatementSchema.safeParse({ text: 'x'.repeat(160) }).success).toBe(true);
  });
  it('rejects a multi-sentence expansion', () => {
    const r = StatementSchema.safeParse({ text: 'x'.repeat(90), expansion: 'One. Two.' });
    expect(r.success).toBe(false);
  });
  it('rejects a non-https source url', () => {
    const r = StatementSchema.safeParse({
      text: 'x'.repeat(90),
      source: { title: 'A', url: 'http://en.wikipedia.org/wiki/A', revisionId: 1 },
    });
    expect(r.success).toBe(false);
  });
});

describe('RoundSchema', () => {
  it('accepts a valid round', () => {
    expect(RoundSchema.safeParse(makeRound('History')).success).toBe(true);
  });

  it('requires a source on every truth', () => {
    const round = makeRound('History', 0);
    delete round.statements[1]!.source;
    const r = RoundSchema.safeParse(round);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/truth must have a source/);
  });

  it('forbids a source on the lie', () => {
    const round = makeRound('History', 2);
    round.statements[2]!.source = {
      title: 'A',
      url: 'https://en.wikipedia.org/wiki/A',
      revisionId: 1,
    };
    const r = RoundSchema.safeParse(round);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/lie must not have a source/);
  });

  it('forbids an expansion on the lie', () => {
    const round = makeRound('History', 0);
    round.statements[0]!.expansion = 'Nope.';
    expect(RoundSchema.safeParse(round).success).toBe(false);
  });

  it('requires exactly 3 statements', () => {
    const round = makeRound('History', 0);
    round.statements.pop();
    expect(RoundSchema.safeParse(round).success).toBe(false);
  });

  it.each([-1, 3, 1.5])('rejects lieIndex %s', (lieIndex) => {
    expect(RoundSchema.safeParse({ ...makeRound('History'), lieIndex }).success).toBe(false);
  });

  it.each([0, 6])('rejects difficulty %s', (difficulty) => {
    expect(RoundSchema.safeParse({ ...makeRound('History'), difficulty }).success).toBe(false);
  });
});

describe('PuzzleSchema', () => {
  it('accepts a valid puzzle', () => {
    expect(PuzzleSchema.safeParse(makePuzzle()).success).toBe(true);
  });

  it('requires exactly 5 rounds', () => {
    const p = makePuzzle();
    p.rounds.pop();
    expect(PuzzleSchema.safeParse(p).success).toBe(false);
  });

  it('requires the fixed category order', () => {
    const p = makePuzzle();
    [p.rounds[0], p.rounds[1]] = [p.rounds[1]!, p.rounds[0]!];
    const r = PuzzleSchema.safeParse(p);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/Round 1 must be "History"/);
  });

  it('rejects an invalid date', () => {
    expect(PuzzleSchema.safeParse(makePuzzle({ date: '2026-02-30' })).success).toBe(false);
  });

  it('rejects unknown top-level fields', () => {
    expect(PuzzleSchema.safeParse({ ...makePuzzle(), answers: [] }).success).toBe(false);
  });
});
