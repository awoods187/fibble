import { describe, expect, it } from 'vitest';
import { buildShareText } from './share';

describe('buildShareText', () => {
  it('matches the PRD example exactly', () => {
    expect(
      buildShareText({ puzzleNumber: 42, rounds: [true, true, false, true, true], streak: 12 }),
    ).toBe('Fibble #42  4/5  🔥12\n🏛️🟩 🔬🟩 🌍🟥 🏆🟩 🎬🟩\nfibble.app');
  });

  it('omits the streak when it is 0 or missing', () => {
    const rounds = [false, false, false, false, false];
    expect(buildShareText({ puzzleNumber: 1, rounds, streak: 0 }).split('\n')[0]).toBe(
      'Fibble #1  0/5',
    );
    expect(buildShareText({ puzzleNumber: 1, rounds }).split('\n')[0]).toBe('Fibble #1  0/5');
  });

  it('never contains statement text or card positions', () => {
    const text = buildShareText({ puzzleNumber: 7, rounds: [true, true, true, true, true] });
    expect(text).not.toMatch(/card|[123] of|lie|truth/i);
  });

  it('throws unless there are exactly 5 results', () => {
    expect(() => buildShareText({ puzzleNumber: 1, rounds: [true] })).toThrow(RangeError);
  });
});
