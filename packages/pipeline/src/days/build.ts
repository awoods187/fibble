import {
  CATEGORIES,
  type Category,
  LAUNCH_DATE,
  type LieIndex,
  type Puzzle,
  puzzleNumber,
  type Round,
  RoundSchema,
} from '@fibble/shared';
import { DUPLICATE_OVERLAP, overlap } from '../generate/checks';
import { checkDay, utcDay } from '../publish/plan';
import type { ApprovedRound } from '../review/schemas';
import { seededShuffle } from '../shuffle';

/**
 * Day assembly (ADR 0013): turn approved rounds into bank days. Each day takes one round
 * per category in the fixed order (History, Science & Nature, Geography & Places, Sports
 * & Games, Arts & Entertainment), on the next free dates. Lie positions are rebalanced so
 * each card holds the lie equally often across the batch. Every day passes the same
 * checks as the publisher before it's returned.
 *
 * Dedupe (PRD stage 6, basic version): a round is skipped if a truth's article is already
 * in the bank, or if any of its statements shares most of its words with a statement in the
 * bank or earlier in the batch. Embedding similarity can replace the word check later.
 */

export interface BuildInput {
  approved: ApprovedRound[];
  /** Dates already in bank/: never overwritten. */
  existingDates: string[];
  /** Wikipedia articles already used by truths in bank/: never reused. */
  usedArticles: Set<string>;
  /** Every statement already in bank/, for the similarity check. */
  bankTexts?: string[];
  /** Fibble #1's date (default LAUNCH_DATE). No day before it is built. */
  launchDate?: string;
  /** First date to fill (default: the day after the last bank day, or today, never before launch). */
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

/** Whether two statements are near-duplicates (most of the shorter one's words in the other). */
export const tooSimilar = (a: string, b: string) => overlap(a, b) > DUPLICATE_OVERLAP;

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
  launchDate = LAUNCH_DATE,
): string[] {
  const taken = new Set(existing);
  const last = [...existing].sort().at(-1);
  const today = utcDay(now, 0);
  let cursor =
    start ??
    (last ? utcDay(new Date(`${last}T00:00:00Z`), 1) : today > launchDate ? today : launchDate);
  if (cursor < launchDate)
    throw new RangeError(`Can't build ${cursor}: before launch (${launchDate})`);
  const out: string[] = [];
  while (out.length < count) {
    if (!taken.has(cursor)) out.push(cursor);
    cursor = utcDay(new Date(`${cursor}T00:00:00Z`), 1);
  }
  return out;
}

export function buildDays(input: BuildInput): BuildResult {
  const used = new Set(input.usedArticles);
  const launch = input.launchDate ?? LAUNCH_DATE;
  const seenTexts = [...(input.bankTexts ?? [])];
  const similarTo = (r: ApprovedRound) =>
    r.round.statements.find((s) => seenTexts.some((t) => tooSimilar(s.text, t)));
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
    if (similarTo(r)) {
      leftover.push({
        roundId: r.roundId,
        category: r.round.category,
        reason: 'a statement is too similar to one in the bank',
      });
      continue;
    }
    queues.get(r.round.category)?.push(r);
  }

  const possible = Math.min(input.count, ...CATEGORIES.map((c) => queues.get(c.name)?.length ?? 0));
  const dates = nextDates(input.existingDates, input.start, input.now, possible, launch);
  const positions = balancedLieIndexes(possible * CATEGORIES.length, input.seed);
  const days: BuiltDay[] = [];

  for (const [d, date] of dates.entries()) {
    const picks: ApprovedRound[] = [];
    for (const c of CATEGORIES) {
      const queue = queues.get(c.name) ?? [];
      // Take the next round that repeats no article or statement already chosen.
      const idx = queue.findIndex((r) => !r.sourceTitles.some((t) => used.has(t)) && !similarTo(r));
      const pick = idx >= 0 ? queue.splice(idx, 1)[0] : undefined;
      if (!pick) break;
      picks.push(pick);
      for (const t of pick.sourceTitles) used.add(t);
      seenTexts.push(...pick.round.statements.map((s) => s.text));
    }
    if (picks.length < CATEGORIES.length) {
      // An incomplete day isn't built; its rounds stay available for a later batch.
      for (const p of picks) {
        leftover.push({
          roundId: p.roundId,
          category: p.round.category,
          reason: 'no full day left for it',
        });
      }
      break;
    }
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
