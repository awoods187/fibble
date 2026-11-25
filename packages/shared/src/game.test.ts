import { describe, expect, it } from 'vitest';
import {
  applyResult,
  chooseLie,
  displayedStreak,
  emptyStats,
  formatCountdown,
  formatDuration,
  GameStateSchema,
  isFinished,
  isLastCard,
  localDateString,
  markTruth,
  msUntilLocalMidnight,
  newGame,
  nextRound,
  previousDate,
  recordCompletion,
  roundOutcomes,
  roundTimes,
  score,
  skipCard,
  stack,
  startRound,
  StatsSchema,
  type GameState,
  type MarkResult,
  unmarkTruth,
} from './game';
import type { AnswerResult, LieIndex } from './schema';

const ok = (r: MarkResult): GameState => {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.state;
};
const result = (round: number, choice: LieIndex, lieIndex: LieIndex): AnswerResult => ({
  round,
  choice,
  correct: choice === lieIndex,
  lieIndex,
  lieNote: 'n',
  truths: ([0, 1, 2] as LieIndex[])
    .filter((i) => i !== lieIndex)
    .map((index) => ({
      index,
      expansion: 'e',
      source: { title: 't', url: 'https://en.wikipedia.org/wiki/T', revisionId: 1 },
    })),
});

describe('round mechanics', () => {
  const game = newGame('2026-11-25', 1);

  it('starts with five fresh rounds and validates as saved JSON', () => {
    expect(game.rounds).toHaveLength(5);
    expect(game.rounds[0]).toEqual({ truths: [], order: [0, 1, 2] });
    expect(GameStateSchema.safeParse(JSON.parse(JSON.stringify(game))).success).toBe(true);
  });

  it('marks and unmarks truths (the truth tray)', () => {
    const a = ok(markTruth(game, 0, 1));
    expect(a.rounds[0]?.truths).toEqual([1]);
    expect(ok(markTruth(a, 0, 1)).rounds[0]?.truths).toEqual([1]); // idempotent
    expect(ok(unmarkTruth(a, 0, 1)).rounds[0]?.truths).toEqual([]);
  });

  it('refuses a third truth: one of these is a fib', () => {
    const two = ok(markTruth(ok(markTruth(game, 0, 0)), 0, 1));
    expect(isLastCard(two.rounds[0]!)).toBe(true);
    expect(markTruth(two, 0, 2)).toEqual({ ok: false, reason: 'last-card' });
  });

  it('skips a card to the back of the stack; truths leave the stack', () => {
    const s = ok(skipCard(game, 0, 0));
    expect(s.rounds[0]?.order).toEqual([1, 2, 0]);
    expect(stack(ok(markTruth(s, 0, 1)).rounds[0]!)).toEqual([2, 0]);
  });

  it('choosing the lie locks the round, even if that card was marked truth', () => {
    const marked = ok(markTruth(game, 0, 2));
    const locked = ok(chooseLie(marked, 0, 2, 5000));
    expect(locked.rounds[0]).toMatchObject({ choice: 2, lockedAt: 5000, truths: [] });
    for (const attempt of [
      markTruth(locked, 0, 0),
      unmarkTruth(locked, 0, 0),
      skipCard(locked, 0, 0),
      chooseLie(locked, 0, 1, 6000),
    ]) {
      expect(attempt).toEqual({ ok: false, reason: 'locked' });
    }
  });

  it('records when a round started, only the first time', () => {
    const s = startRound(startRound(game, 0, 1000), 0, 9999);
    expect(s.rounds[0]?.startedAt).toBe(1000);
  });

  it("stores the server's answer only for the choice that was made", () => {
    const locked = ok(chooseLie(game, 0, 1, 1));
    expect(applyResult(locked, 0, result(1, 1, 1)).rounds[0]?.result?.correct).toBe(true);
    expect(() => applyResult(locked, 0, result(1, 2, 1))).toThrow(/doesn't match/);
    expect(() => applyResult(locked, 0, result(2, 1, 1))).toThrow(/doesn't match/);
  });

  it('moves on only after a revealed round, then to the results', () => {
    expect(nextRound(game).current).toBe(0);
    let s = game;
    for (let n = 0; n < 5; n++) {
      s = startRound(s, n, n * 10_000);
      s = applyResult(
        ok(chooseLie(s, n, 0, n * 10_000 + 4_000)),
        n,
        result(n + 1, 0, n % 2 === 0 ? 0 : 1),
      );
      s = nextRound(s);
    }
    expect(s.current).toBe(5);
    expect(isFinished(s)).toBe(true);
    expect(score(s)).toBe(3);
    expect(roundOutcomes(s)).toEqual([true, false, true, false, true]);
    expect(roundTimes(s)).toEqual([4000, 4000, 4000, 4000, 4000]);
  });
});

describe('streaks and stats', () => {
  it('builds a streak over consecutive days and records the histogram', () => {
    let s = recordCompletion(emptyStats(), '2026-11-25', 5);
    s = recordCompletion(s, '2026-11-26', 3);
    expect(s).toMatchObject({
      played: 2,
      currentStreak: 2,
      maxStreak: 2,
      perfectDays: 1,
      lastCompletedDate: '2026-11-26',
    });
    expect(s.histogram).toEqual([0, 0, 0, 1, 0, 1]);
    expect(StatsSchema.safeParse(s).success).toBe(true);
  });

  it('is idempotent for the same day', () => {
    const s = recordCompletion(emptyStats(), '2026-11-25', 4);
    expect(recordCompletion(s, '2026-11-25', 4)).toBe(s);
  });

  it('resets the streak after a missed day, but keeps the max', () => {
    let s = recordCompletion(emptyStats(), '2026-11-25', 1);
    s = recordCompletion(s, '2026-11-26', 1);
    s = recordCompletion(s, '2026-11-28', 1);
    expect(s).toMatchObject({ currentStreak: 1, maxStreak: 2 });
  });

  it('shows a broken streak as 0 before the next day is played', () => {
    const s = recordCompletion(emptyStats(), '2026-11-25', 2);
    expect(displayedStreak(s, '2026-11-25')).toBe(1);
    expect(displayedStreak(s, '2026-11-26')).toBe(1);
    expect(displayedStreak(s, '2026-11-27')).toBe(0);
  });

  it('counts back across month and year ends', () => {
    expect(previousDate('2026-12-01')).toBe('2026-11-30');
    expect(previousDate('2027-01-01')).toBe('2026-12-31');
  });
});

describe('local time', () => {
  it("uses the player's local calendar date", () => {
    expect(localDateString(new Date(2026, 10, 25, 23, 59))).toBe('2026-11-25');
    expect(localDateString(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });

  it('counts down to local midnight', () => {
    expect(msUntilLocalMidnight(new Date(2026, 10, 25, 23, 0, 0))).toBe(60 * 60 * 1000);
  });

  it('formats the countdown and durations', () => {
    expect(formatCountdown((3 * 3600 + 4 * 60 + 5) * 1000)).toBe('3h 04m 05s');
    expect(formatCountdown(-5)).toBe('0h 00m 00s');
    expect(formatDuration(65_400)).toBe('1:05');
  });
});
