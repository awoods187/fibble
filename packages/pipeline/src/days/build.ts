import {
  CATEGORIES,
  type Category,
  type LieIndex,
  type Puzzle,
  puzzleNumber,
  type Round,
  RoundSchema,
} from '@fibble/shared';
import { checkDay, utcDay } from '../publish/plan';
import type { ApprovedRound } from '../review/schemas';
import { seededShuffle } from '../shuffle';

/**
 * Day assembly (ADR 0013): turn approved rounds into bank days. Each day takes one round
 * per category in the fixed order (History, Science & Nature, Geography & Places, Sports
 * & Games, Arts & Entertainment), on the next free dates. Lie positions are rebalanced so
 * each card holds the lie equally often across the batch. Every day passes the same
 * checks as the publisher before it's returned.
 */

export interface BuildInput {
  approved: ApprovedRound[];
  /** Dates already in bank/: never overwritten, and the first one is puzzle #1. */
  existingDates: string[];
  /** Wikipedia articles already used by truths in bank/: never reused. */
  usedArticles: Set<string>;
  /** First date to fill (default: the day after the last bank day, or tomorrow). */
  start?: string;
  /** At most this many days. */
  count: number;
  seed: string;
  now: Date;
}

export interface BuiltDay {
  puzzle: Puzzle;
  /** Which approved round fills each category, in order. */
  roundIds: string[];
}

export interface BuildResult {
  days: BuiltDay[];
  /** Approved rounds not used: their category ran out first, or an article was already used. */
  leftover: { roundId: string; category: Category; reason: string }[];
  /** Why building stopped. */
  stoppedBecause: string;
}

/** The same round with its lie moved to `index`; the truths keep their order. */
export function moveLie(round: Round, index: LieIndex): Round {
  const lie = round.statements[round.lieIndex];
  if (!lie || index === round.lieIndex) return round;
  const truths = round.statements.filter((_, i) => i !== round.lieIndex);
  truths.splice(index, 0, lie);
  return RoundSchema.parse({ ...round, statements: truths, lieIndex: index });
}

/** Positions 0, 1, 2 used equally often across n rounds, in a seeded order. */
export function balancedLieIndexes(n: number, seed: string): LieIndex[] {
  return seededShuffle(
    Array.from({ length: n }, (_, i) => (i % 3) as LieIndex),
    `${seed}:lie-positions`,
  );
}

export function nextDates(
  existing: string[],
  start: string | undefined,
  now: Date,
  count: number,
): string[] {
  const taken = new Set(existing);
  const last = [...existing].sort().at(-1);
  let cursor = start ?? (last ? utcDay(new Date(`${last}T00:00:00Z`), 1) : utcDay(now, 1));
  const out: string[] = [];
  while (out.length < count) {
    if (!taken.has(cursor)) out.push(cursor);
    cursor = utcDay(new Date(`${cursor}T00:00:00Z`), 1);
  }
  return out;
}

export function buildDays(input: BuildInput): BuildResult {
  const used = new Set(input.usedArticles);
  const queues = new Map<Category, ApprovedRound[]>(CATEGORIES.map((c) => [c.name, []]));
  const leftover: BuildResult['leftover'] = [];
  for (const r of input.approved) {
    if (r.sourceTitles.some((t) => used.has(t))) {
      leftover.push({
        roundId: r.roundId,
        category: r.round.category,
        reason: 'uses an article already in the bank',
      });
      continue;
    }
    queues.get(r.round.category)?.push(r);
  }

  const possible = Math.min(input.count, ...CATEGORIES.map((c) => queues.get(c.name)?.length ?? 0));
  const dates = nextDates(input.existingDates, input.start, input.now, possible);
  const launch = [...input.existingDates, ...dates].sort()[0] ?? dates[0] ?? '';
  const positions = balancedLieIndexes(possible * CATEGORIES.length, input.seed);
  const days: BuiltDay[] = [];

  for (const [d, date] of dates.entries()) {
    const picks: ApprovedRound[] = [];
    for (const c of CATEGORIES) {
      const queue = queues.get(c.name) ?? [];
      // Take the next round whose articles this batch hasn't used yet.
      const idx = queue.findIndex((r) => !r.sourceTitles.some((t) => used.has(t)));
      const pick = idx >= 0 ? queue.splice(idx, 1)[0] : undefined;
      if (!pick) break;
      picks.push(pick);
      for (const t of pick.sourceTitles) used.add(t);
    }
    if (picks.length < CATEGORIES.length) break;
    const rounds = picks.map((p, k) =>
      moveLie(p.round, positions[d * CATEGORIES.length + k] ?? p.round.lieIndex),
    );
    const puzzle = { date, puzzleNumber: puzzleNumber(date, launch), rounds };
    const check = checkDay(date, puzzle, false);
    if (!check.ok) throw new Error(`Built day ${date} fails the publish checks: ${check.reason}`);
    days.push({ puzzle: check.puzzle, roundIds: picks.map((p) => p.roundId) });
  }

  for (const [category, queue] of queues) {
    for (const r of queue)
      leftover.push({ roundId: r.roundId, category, reason: 'no full day left for it' });
  }
  const short = CATEGORIES.filter((c) => (queues.get(c.name)?.length ?? 0) === 0).map(
    (c) => c.name,
  );
  const stoppedBecause =
    days.length >= input.count
      ? `reached the requested ${input.count} day(s)`
      : `ran out of approved rounds in: ${short.join(', ') || 'none'}`;
  return { days, leftover, stoppedBecause };
}
