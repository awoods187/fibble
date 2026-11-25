import { describe, expect, it } from 'vitest';
import type { RewordedTruth } from '../types';
import { checkLie, duplicateIndexes, overlap } from './checks';
import type { GeneratedLie } from './schemas';

// Made-up content; no real Wikipedia text.
function truth(text: string, entities: string[]): RewordedTruth {
  return {
    candidateId: `t-${entities[0]}`,
    category: 'History',
    text,
    expansion: 'x',
    source: { title: 'T', url: 'https://en.wikipedia.org/wiki/T', revisionId: 1 },
    supportingSentence: 'x',
    entities,
    scores: { surprise: 4, verifiability: 4 },
    entailment: { supported: true, unsupportedDetails: [] },
    usage: [],
    trace: { stage: 'reword', promptVersion: 'x', createdAt: '2026-11-25T00:00:00.000Z' },
  };
}

const TRUTHS: [RewordedTruth, RewordedTruth] = [
  truth(
    'The Glass Lighthouse of Vell relied on tallow candles for its light right up until the year 1931.',
    ['Glass Lighthouse of Vell'],
  ),
  truth(
    'In 1802 the harbour town of Quillmouth paid its fishermen in salted herring instead of coins.',
    ['Quillmouth'],
  ),
];
const GOOD: GeneratedLie = {
  text: 'In 1874 a Danish ferry company issued brass tokens to passengers who agreed to help row in calm weather.',
  lieNote: 'Plausible because early ferries had odd crewing rules; this one is invented.',
  borrowedTexture: '19th-century ferry quirks',
};
const reasons = (l: Partial<GeneratedLie>) =>
  checkLie({ ...GOOD, ...l }, TRUTHS).map((f) => f.reason);

describe('checkLie', () => {
  it('passes a lie that follows the rules', () => {
    expect(checkLie(GOOD, TRUTHS)).toEqual([]);
  });

  it('keeps the lie within 15% of the truths average length, and 80 to 160 characters', () => {
    expect(reasons({ text: 'Short lie with 1 number.' })).toEqual(
      expect.arrayContaining(['length', 'length-mismatch']),
    );
    expect(
      reasons({ text: `${GOOD.text} It also kept 3 spare oars on board for passengers.` }),
    ).toContain('length-mismatch');
  });

  it('rejects hedging', () => {
    expect(reasons({ text: GOOD.text.replace('issued', 'reportedly issued') })).toContain(
      'hedging',
    );
  });

  it('requires a one-sentence lie note', () => {
    expect(reasons({ lieNote: 'Invented. Totally.' })).toContain('lie-note');
    expect(reasons({ lieNote: '' })).toContain('lie-note');
  });

  it("rejects a lie about either truth's subject", () => {
    expect(
      reasons({
        text: 'In 1874 the Glass Lighthouse of Vell issued brass tokens to visitors who helped polish its lamps.',
      }),
    ).toContain('same-topic');
  });

  it('rejects a lie that copies a run of words from a truth', () => {
    expect(
      reasons({
        text: 'In 1874 a Danish town relied on tallow candles for its light right up until the war ended.',
      }),
    ).toContain('copied-truth');
  });

  it('requires a number when both truths have one', () => {
    expect(
      reasons({
        text: 'A Danish ferry company once issued brass tokens to passengers who agreed to help row in calm seas.',
      }),
    ).toContain('needs-number');
  });
});

describe('duplicates', () => {
  it('measures content-word overlap', () => {
    expect(overlap('brass tokens for ferry passengers', 'ferry passengers got brass tokens')).toBe(
      1,
    );
    expect(overlap('alpha beta', 'gamma delta')).toBe(0);
  });

  it('flags later near-duplicates, keeping the first', () => {
    const lies = [
      { text: 'A Danish ferry company issued brass tokens to rowing passengers in 1874.' },
      { text: 'In 1874 a Danish ferry company gave brass tokens to passengers who rowed.' },
      { text: 'Venetian glassmakers were once forbidden to leave their island.' },
    ];
    expect([...duplicateIndexes(lies)]).toEqual([1]);
  });
});
