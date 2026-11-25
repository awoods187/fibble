import { CATEGORIES } from '../categories';
import type { Puzzle, Round } from '../schema';

const pad = (s: string) => s.padEnd(90, '.');

export function makeRound(category: Round['category'], lieIndex: Round['lieIndex'] = 1): Round {
  return {
    category,
    difficulty: 2,
    lieIndex,
    lieNote: 'Plausible because it borrows real texture; this specific thing never happened.',
    statements: [0, 1, 2].map((i) =>
      i === lieIndex
        ? { text: pad(`${category} lie`) }
        : {
            text: pad(`${category} truth ${i}`),
            expansion: `Expansion for ${category} truth ${i}.`,
            source: {
              title: `Article ${i}`,
              url: `https://en.wikipedia.org/wiki/Article_${i}`,
              revisionId: 1000 + i,
            },
          },
    ),
  };
}

export function makePuzzle(overrides: Partial<Puzzle> = {}): Puzzle {
  return {
    date: '2026-11-24',
    puzzleNumber: 1,
    rounds: CATEGORIES.map((c, i) => makeRound(c.name, (i % 3) as Round['lieIndex'])),
    ...overrides,
  };
}
