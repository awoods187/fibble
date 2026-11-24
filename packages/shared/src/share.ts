import { CATEGORIES, ROUNDS_PER_PUZZLE } from './categories';

export const SHARE_URL = 'fibble.app';
const CORRECT = '🟩';
const WRONG = '🟥';

export interface ShareInput {
  puzzleNumber: number;
  /** Whether the player found the lie, per round, in category order. */
  rounds: readonly boolean[];
  /** Current play streak. Omitted from the text when 0 or missing. */
  streak?: number;
}

/**
 * Spoiler-free share text (PRD section 3). It shows which categories the
 * player got, never which card was the lie or what it said:
 *
 *   Fibble #42  4/5  🔥12
 *   🏛️🟩 🔬🟩 🌍🟥 🏆🟩 🎬🟩
 *   fibble.app
 */
export function buildShareText({ puzzleNumber, rounds, streak }: ShareInput): string {
  if (rounds.length !== ROUNDS_PER_PUZZLE) {
    throw new RangeError(`Expected ${ROUNDS_PER_PUZZLE} round results, got ${rounds.length}`);
  }
  const score = rounds.filter(Boolean).length;
  const header = [`Fibble #${puzzleNumber}`, `${score}/${ROUNDS_PER_PUZZLE}`];
  if (streak !== undefined && streak > 0) header.push(`🔥${streak}`);
  const grid = CATEGORIES.map((c, i) => `${c.emoji}${rounds[i] ? CORRECT : WRONG}`).join(' ');
  return [header.join('  '), grid, SHARE_URL].join('\n');
}
