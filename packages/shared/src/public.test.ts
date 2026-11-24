import { describe, expect, it } from 'vitest';
import { buildAnswerResult, toPublicPuzzle } from './public';
import { makePuzzle, makeRound } from './test/fixtures';

const FORBIDDEN_KEYS = ['lieIndex', 'lieNote', 'expansion', 'source'];

function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, keys));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k);
      allKeys(v, keys);
    }
  }
  return keys;
}

describe('toPublicPuzzle', () => {
  const puzzle = makePuzzle({ sample: true });
  const pub = toPublicPuzzle(puzzle);

  it('strips every answer field at any depth', () => {
    const keys = allKeys(pub);
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k)).toBe(false);
  });

  it('does not leak answers anywhere in the serialized JSON', () => {
    const json = JSON.stringify(pub);
    expect(json).not.toMatch(/wikipedia\.org|Expansion for|Plausible because/);
  });

  it('keeps statement text in original card order', () => {
    expect(pub.rounds[2]!.statements.map((s) => s.text)).toEqual(
      puzzle.rounds[2]!.statements.map((s) => s.text),
    );
  });

  it('numbers rounds from 1 and keeps date, number and sample flag', () => {
    expect(pub.rounds.map((r) => r.round)).toEqual([1, 2, 3, 4, 5]);
    expect(pub).toMatchObject({ date: puzzle.date, puzzleNumber: 1, sample: true });
  });

  it('omits the sample flag when the puzzle has none', () => {
    expect('sample' in toPublicPuzzle(makePuzzle())).toBe(false);
  });
});

describe('buildAnswerResult', () => {
  const round = makeRound('History', 2);

  it('marks the lie as correct', () => {
    expect(buildAnswerResult(round, 1, 2)).toMatchObject({ correct: true, choice: 2, lieIndex: 2 });
  });

  it('marks a truth as wrong and still reveals the lie', () => {
    const r = buildAnswerResult(round, 1, 0);
    expect(r).toMatchObject({ correct: false, choice: 0, lieIndex: 2, lieNote: round.lieNote });
  });

  it('reveals both truths with their sources and expansions', () => {
    const r = buildAnswerResult(round, 3, 0);
    expect(r.round).toBe(3);
    expect(r.truths.map((t) => t.index)).toEqual([0, 1]);
    expect(r.truths[0]!.source.url).toMatch(/^https:\/\/en\.wikipedia\.org/);
    expect(r.truths[1]!.expansion).toMatch(/Expansion/);
  });
});
