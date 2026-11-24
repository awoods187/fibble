/**
 * The five daily categories, in the fixed order every puzzle uses (PRD section 3).
 * Round 1 is always History, round 5 is always Arts & Entertainment.
 */
export const CATEGORIES = [
  { slot: 1, name: 'History', emoji: '🏛️' },
  { slot: 2, name: 'Science & Nature', emoji: '🔬' },
  { slot: 3, name: 'Geography & Places', emoji: '🌍' },
  { slot: 4, name: 'Sports & Games', emoji: '🏆' },
  { slot: 5, name: 'Arts & Entertainment', emoji: '🎬' },
] as const;

export type Category = (typeof CATEGORIES)[number]['name'];

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name) as [Category, ...Category[]];

/** Number of rounds in a daily puzzle. */
export const ROUNDS_PER_PUZZLE = CATEGORIES.length;

/** Number of statements in a round. */
export const STATEMENTS_PER_ROUND = 3;
