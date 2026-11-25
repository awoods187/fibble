import { z } from 'zod';
import { ROUNDS_PER_PUZZLE, STATEMENTS_PER_ROUND } from './categories';
import {
  AnswerResultSchema,
  type AnswerResult,
  type LieIndex,
  LieIndexSchema,
  PuzzleDateSchema,
} from './schema';

/**
 * The game's rules as pure functions (PRD section 3, "Round mechanics"). The UI calls
 * these; it never decides a rule itself. State is plain JSON so it can be saved to
 * localStorage and resumed.
 *
 * - Marking a card "truth" puts it in the truth tray; tapping a tray chip takes it back.
 * - Skipping moves a card to the back of the stack, unjudged.
 * - With two truths marked, the last card can't be marked truth ("One of these is a fib").
 * - Choosing the lie locks the round at once. That choice is the answer.
 */

export const GAME_STATE_VERSION = 1;

export const RoundPlaySchema = z.strictObject({
  /** Cards marked truth (indexes into the round's statements). */
  truths: z.array(LieIndexSchema).max(STATEMENTS_PER_ROUND - 1),
  /** Stack order on mobile: card indexes, top first. Skipping moves a card to the back. */
  order: z.array(LieIndexSchema).length(STATEMENTS_PER_ROUND),
  /** The card chosen as the lie. Set once; the round is locked from then on. */
  choice: LieIndexSchema.optional(),
  /** The server's answer, once it has replied. */
  result: AnswerResultSchema.optional(),
  /** Epoch ms when the round was first shown, and when the lie was chosen. */
  startedAt: z.number().optional(),
  lockedAt: z.number().optional(),
});
export type RoundPlay = z.infer<typeof RoundPlaySchema>;

export const GameStateSchema = z.strictObject({
  version: z.literal(GAME_STATE_VERSION),
  date: PuzzleDateSchema,
  puzzleNumber: z.int().positive(),
  /** The round on screen, 0-4; ROUNDS_PER_PUZZLE once the results are showing. */
  current: z.int().min(0).max(ROUNDS_PER_PUZZLE),
  rounds: z.array(RoundPlaySchema).length(ROUNDS_PER_PUZZLE),
});
export type GameState = z.infer<typeof GameStateSchema>;

export type MarkResult =
  { ok: true; state: GameState } | { ok: false; reason: 'locked' | 'last-card' };

const freshRound = (): RoundPlay => ({ truths: [], order: [0, 1, 2] });

export function newGame(date: string, puzzleNumber: number): GameState {
  return {
    version: GAME_STATE_VERSION,
    date,
    puzzleNumber,
    current: 0,
    rounds: Array.from({ length: ROUNDS_PER_PUZZLE }, freshRound),
  };
}

function updateRound(state: GameState, n: number, change: (r: RoundPlay) => RoundPlay): GameState {
  return { ...state, rounds: state.rounds.map((r, i) => (i === n ? change(r) : r)) };
}

const roundAt = (state: GameState, n: number): RoundPlay => {
  const r = state.rounds[n];
  if (!r) throw new RangeError(`No round ${n}`);
  return r;
};

export const isLocked = (r: RoundPlay) => r.choice !== undefined;

/** Record when a round was first shown (for the time shown on the results screen). */
export function startRound(state: GameState, n: number, now: number): GameState {
  return roundAt(state, n).startedAt === undefined
    ? updateRound(state, n, (r) => ({ ...r, startedAt: now }))
    : state;
}

/** Mark a card as truth. Refused once locked, or if it would make all three truths. */
export function markTruth(state: GameState, n: number, card: LieIndex): MarkResult {
  const r = roundAt(state, n);
  if (isLocked(r)) return { ok: false, reason: 'locked' };
  if (r.truths.includes(card)) return { ok: true, state };
  if (r.truths.length >= STATEMENTS_PER_ROUND - 1) return { ok: false, reason: 'last-card' };
  return { ok: true, state: updateRound(state, n, (x) => ({ ...x, truths: [...x.truths, card] })) };
}

/** Take a card back out of the truth tray. */
export function unmarkTruth(state: GameState, n: number, card: LieIndex): MarkResult {
  if (isLocked(roundAt(state, n))) return { ok: false, reason: 'locked' };
  return {
    ok: true,
    state: updateRound(state, n, (x) => ({ ...x, truths: x.truths.filter((c) => c !== card) })),
  };
}

/** Skip a card: it goes to the back of the stack, unjudged. */
export function skipCard(state: GameState, n: number, card: LieIndex): MarkResult {
  if (isLocked(roundAt(state, n))) return { ok: false, reason: 'locked' };
  return {
    ok: true,
    state: updateRound(state, n, (x) => ({
      ...x,
      order: [...x.order.filter((c) => c !== card), card],
    })),
  };
}

/** Choose the lie. This locks the round: it's the answer, and can't be changed. */
export function chooseLie(state: GameState, n: number, card: LieIndex, now: number): MarkResult {
  if (isLocked(roundAt(state, n))) return { ok: false, reason: 'locked' };
  return {
    ok: true,
    state: updateRound(state, n, (x) => ({
      ...x,
      choice: card,
      lockedAt: now,
      truths: x.truths.filter((c) => c !== card),
    })),
  };
}

/** Store the server's answer. It must be for this round and the choice that was made. */
export function applyResult(state: GameState, n: number, result: AnswerResult): GameState {
  const r = roundAt(state, n);
  if (result.round !== n + 1 || result.choice !== r.choice) {
    throw new Error(
      `Answer for round ${result.round} (choice ${result.choice}) doesn't match round ${n + 1}`,
    );
  }
  return updateRound(state, n, (x) => ({ ...x, result }));
}

/** Move on after a revealed round; past round 5 this shows the results. */
export function nextRound(state: GameState): GameState {
  const r = state.rounds[state.current];
  if (!r?.result) return state;
  return { ...state, current: Math.min(state.current + 1, ROUNDS_PER_PUZZLE) };
}

/** Cards still in the mobile stack (not marked truth), top first. */
export function stack(r: RoundPlay): LieIndex[] {
  return r.order.filter((c) => !r.truths.includes(c));
}

/** True when the top card can't be marked truth: it's the last one left. */
export function isLastCard(r: RoundPlay): boolean {
  return r.truths.length >= STATEMENTS_PER_ROUND - 1;
}

export const isFinished = (state: GameState) => state.rounds.every((r) => r.result !== undefined);

/** Whether the lie was found, per round (undefined until answered). */
export const roundOutcomes = (state: GameState): (boolean | undefined)[] =>
  state.rounds.map((r) => r.result?.correct);

export const score = (state: GameState) => state.rounds.filter((r) => r.result?.correct).length;

/** Milliseconds from first sight to the answer, per round (undefined if not both known). */
export const roundTimes = (state: GameState): (number | undefined)[] =>
  state.rounds.map((r) =>
    r.startedAt !== undefined && r.lockedAt !== undefined ? r.lockedAt - r.startedAt : undefined,
  );

/* ---------- Streaks and stats (localStorage, no account) ---------- */

export const STATS_VERSION = 1;

export const StatsSchema = z.strictObject({
  version: z.literal(STATS_VERSION),
  played: z.int().nonnegative(),
  currentStreak: z.int().nonnegative(),
  maxStreak: z.int().nonnegative(),
  perfectDays: z.int().nonnegative(),
  /** Days finished with each score, 0 to 5. */
  histogram: z.array(z.int().nonnegative()).length(ROUNDS_PER_PUZZLE + 1),
  lastCompletedDate: PuzzleDateSchema.optional(),
});
export type Stats = z.infer<typeof StatsSchema>;

export const emptyStats = (): Stats => ({
  version: STATS_VERSION,
  played: 0,
  currentStreak: 0,
  maxStreak: 0,
  perfectDays: 0,
  histogram: Array.from({ length: ROUNDS_PER_PUZZLE + 1 }, () => 0),
});

/** The calendar date before a YYYY-MM-DD date. */
export function previousDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * Record a finished day. Idempotent for the same date. The streak continues only if the
 * last finished day was the day before; otherwise it restarts at 1 (PRD: a missed day resets).
 */
export function recordCompletion(stats: Stats, date: string, dayScore: number): Stats {
  if (stats.lastCompletedDate === date) return stats;
  const streak = stats.lastCompletedDate === previousDate(date) ? stats.currentStreak + 1 : 1;
  return {
    ...stats,
    played: stats.played + 1,
    currentStreak: streak,
    maxStreak: Math.max(stats.maxStreak, streak),
    perfectDays: stats.perfectDays + (dayScore === ROUNDS_PER_PUZZLE ? 1 : 0),
    histogram: stats.histogram.map((n, i) => (i === dayScore ? n + 1 : n)),
    lastCompletedDate: date,
  };
}

/** The streak to show today: it's already broken if neither today nor yesterday was finished. */
export function displayedStreak(stats: Stats, today: string): number {
  const last = stats.lastCompletedDate;
  return last === today || last === previousDate(today) ? stats.currentStreak : 0;
}

/* ---------- Local time ---------- */

/** The player's local calendar date as YYYY-MM-DD: a new puzzle starts at local midnight. */
export function localDateString(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Milliseconds until the next local midnight. */
export function msUntilLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** "3h 04m 05s"-style countdown text. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

/** "1:05"-style duration for the results screen. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
