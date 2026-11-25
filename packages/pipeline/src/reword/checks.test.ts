import { describe, expect, it } from 'vitest';
import { checkDraft, longestSharedRun, MAX_SHARED_WORDS, normalizeForQuote, words } from './checks';
import type { RewordDraft } from './schemas';

// Made-up content; no real Wikipedia text.
const EVIDENCE =
  'The Glass Lighthouse of Vell is an imaginary lighthouse. Keepers lit its lamp with tallow candles until 1931, when oil lamps arrived. It stands twelve metres tall.';
const HOOK = '... that the Glass Lighthouse of Vell was lit by candles until 1931?';

const good: RewordDraft = {
  text: 'An imaginary coastal beacon, the Glass Lighthouse of Vell, relied on tallow candles for light right up until 1931.',
  expansion: 'Oil lamps finally replaced the candles in 1931.',
  supportingSentence:
    'Keepers lit its lamp with tallow candles until 1931, when oil lamps arrived.',
  category: 'History',
  entities: ['Glass Lighthouse of Vell'],
  surprise: 4,
  verifiability: 5,
  contentFlags: [],
};

const reasons = (d: Partial<RewordDraft>) =>
  checkDraft({ ...good, ...d }, EVIDENCE, HOOK).map((f) => f.reason);

describe('checkDraft', () => {
  it('passes a good draft', () => {
    expect(checkDraft(good, EVIDENCE, HOOK)).toEqual([]);
  });

  it('enforces the 80 to 160 character statement length', () => {
    expect(reasons({ text: 'Too short.' })).toContain('length');
    expect(reasons({ text: 'x'.repeat(161) })).toContain('length');
  });

  it('rejects hedging in the statement or the expansion', () => {
    expect(reasons({ text: `${good.text.slice(0, -1)}, reportedly.` })).toContain('hedging');
    expect(reasons({ expansion: 'It is said oil lamps arrived in 1931.' })).toContain('hedging');
  });

  it('requires a one-sentence expansion', () => {
    expect(reasons({ expansion: 'Oil came in 1931. Then electricity.' })).toContain('expansion');
    expect(reasons({ expansion: '  ' })).toContain('expansion');
  });

  it('requires both scores to be 4 or more', () => {
    expect(reasons({ surprise: 3 })).toContain('low-score');
    expect(reasons({ verifiability: 2 })).toContain('low-score');
  });

  it('rejects any content flag', () => {
    expect(reasons({ contentFlags: ['tragedy'] })).toContain('content-flag');
  });

  it('requires the supporting sentence to appear in the evidence, ignoring spacing and quote style', () => {
    expect(reasons({ supportingSentence: 'Keepers used whale oil until 1950.' })).toContain(
      'no-supporting-sentence',
    );
    expect(
      reasons({
        supportingSentence:
          'Keepers  lit its lamp with tallow candles until 1931,\nwhen oil lamps arrived.',
      }),
    ).toEqual([]);
  });

  it('rejects a statement that copies a long run of words from the source', () => {
    const copied =
      'Keepers lit its lamp with tallow candles until 1931, when oil lamps arrived at the Glass Lighthouse of Vell.';
    expect(reasons({ text: copied })).toContain('copied-source');
  });
});

describe('helpers', () => {
  it('splits words without punctuation, keeping apostrophes and digits', () => {
    expect(words("Galileo's finger, 1737!")).toEqual(["galileo's", 'finger', '1737']);
  });

  it('measures the longest shared run of words', () => {
    expect(longestSharedRun('a b c d e', 'x b c d y')).toBe(3);
    expect(longestSharedRun('one two', 'three four')).toBe(0);
    expect(MAX_SHARED_WORDS).toBe(7);
  });

  it('normalises quotes, dashes and whitespace for quote matching', () => {
    expect(normalizeForQuote('It’s  “here” – now')).toBe('it\'s "here" - now');
  });
});
