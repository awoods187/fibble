import { describe, expect, it } from 'vitest';
import {
  bestSection,
  buildContext,
  CONTEXT_LIMITS,
  contentWords,
  evidencePassage,
  splitSections,
} from './context';

const EXTRACT = `The Glass Lighthouse of Vell is a lighthouse on an imaginary coast.
It is made of glass.

== History ==
Keepers lit the lamp with candles until 1931, when oil lamps arrived.

=== Keepers ===
Three families kept the light.

== Architecture ==
The tower is twelve metres tall.

== References ==
Candles candles candles 1931 1931.`;

describe('splitSections', () => {
  it('separates the lead from headed sections and drops reference-type sections', () => {
    const { lead, sections } = splitSections(EXTRACT);
    expect(lead).toBe(
      'The Glass Lighthouse of Vell is a lighthouse on an imaginary coast.\nIt is made of glass.',
    );
    expect(sections.map((s) => s.heading)).toEqual(['History', 'Keepers', 'Architecture']);
  });

  it('handles an article with no headings', () => {
    expect(splitSections('Just a lead.')).toEqual({ lead: 'Just a lead.', sections: [] });
  });
});

describe('contentWords', () => {
  it('keeps lower-case words of 4+ letters, minus stopwords', () => {
    expect([...contentWords('... that the Lighthouse was lit by candles until 1931?')]).toEqual([
      'lighthouse',
      'candles',
      'until',
      '1931',
    ]);
  });
});

describe('bestSection', () => {
  const { sections } = splitSections(EXTRACT);

  it('picks the section sharing the most words with the hook', () => {
    expect(bestSection(sections, 'lit by candles until 1931')?.heading).toBe('History');
    expect(bestSection(sections, 'the tower is twelve metres tall')?.heading).toBe('Architecture');
  });

  it('returns undefined when nothing matches', () => {
    expect(bestSection(sections, 'zebra')).toBeUndefined();
  });
});

describe('buildContext', () => {
  it('joins the lead and the best section, never a references section', () => {
    const context = buildContext(EXTRACT, '... that the lighthouse was lit by candles until 1931?');
    expect(context).toContain('It is made of glass.');
    expect(context).toContain('== History ==\nKeepers lit the lamp with candles until 1931');
    expect(context).not.toContain('References');
  });

  it('clips a long lead at a sentence boundary', () => {
    const lead = 'A short sentence here. '.repeat(400);
    const context = buildContext(lead, 'nothing');
    expect(context.length).toBeLessThanOrEqual(CONTEXT_LIMITS.lead + 2);
    expect(context.endsWith('here. …')).toBe(true);
  });
});

describe('evidencePassage', () => {
  it('gives the start of the lead plus the best-matching section, clipped', () => {
    const passage = evidencePassage(EXTRACT, 'the tower is twelve metres tall', {
      lead: 30,
      section: 200,
    });
    expect(passage.startsWith('The Glass Lighthouse of Vell i …')).toBe(true);
    expect(passage.endsWith('== Architecture ==\nThe tower is twelve metres tall.')).toBe(true);
  });

  it('returns only the lead when no section matches', () => {
    expect(evidencePassage('Just a lead.', 'zebra')).toBe('Just a lead.');
  });
});
