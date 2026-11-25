import { describe, expect, it } from 'vitest';
import { birthYear, hasDeathDate, isHuman, isLivingPerson, type WikidataEntity } from './living';

const NOW = new Date('2026-11-25T00:00:00Z');

function entity(opts: {
  human?: boolean;
  born?: string;
  died?: 'value' | 'somevalue' | 'novalue';
}): WikidataEntity {
  const claims: NonNullable<WikidataEntity['claims']> = {
    P31: [
      {
        mainsnak: {
          snaktype: 'value',
          datavalue: { value: { id: opts.human === false ? 'Q515' : 'Q5' } },
        },
      },
    ],
  };
  if (opts.born) {
    claims.P569 = [{ mainsnak: { snaktype: 'value', datavalue: { value: { time: opts.born } } } }];
  }
  if (opts.died) {
    claims.P570 = [
      {
        mainsnak:
          opts.died === 'value'
            ? { snaktype: 'value', datavalue: { value: { time: '+1990-01-01T00:00:00Z' } } }
            : { snaktype: opts.died },
      },
    ];
  }
  return { id: 'Q1', claims };
}

describe('living-person helpers', () => {
  it('reads instance-of human, birth year and death claims', () => {
    expect(isHuman(entity({}))).toBe(true);
    expect(isHuman(entity({ human: false }))).toBe(false);
    expect(birthYear(entity({ born: '+1564-02-15T00:00:00Z' }))).toBe(1564);
    expect(birthYear(entity({ born: '-0100-00-00T00:00:00Z' }))).toBe(-100);
    expect(hasDeathDate(entity({ died: 'somevalue' }))).toBe(true);
    expect(hasDeathDate(entity({ died: 'novalue' }))).toBe(false);
  });
});

describe('isLivingPerson', () => {
  it('flags a human with no date of death', () => {
    expect(isLivingPerson(entity({ born: '+1980-01-01T00:00:00Z' }), NOW)).toBe(true);
  });

  it('flags a human with no dates at all, to be safe', () => {
    expect(isLivingPerson(entity({}), NOW)).toBe(true);
  });

  it('does not flag someone with a date of death, even an unknown one', () => {
    expect(isLivingPerson(entity({ died: 'value' }), NOW)).toBe(false);
    expect(isLivingPerson(entity({ died: 'somevalue' }), NOW)).toBe(false);
  });

  it('treats "no value" for date of death as still living', () => {
    expect(isLivingPerson(entity({ died: 'novalue', born: '+1990-01-01T00:00:00Z' }), NOW)).toBe(
      true,
    );
  });

  it('assumes anyone born more than 115 years ago has died', () => {
    expect(isLivingPerson(entity({ born: '+1911-01-01T00:00:00Z' }), NOW)).toBe(true);
    expect(isLivingPerson(entity({ born: '+1910-01-01T00:00:00Z' }), NOW)).toBe(false);
  });

  it('never flags things that are not people', () => {
    expect(isLivingPerson(entity({ human: false }), NOW)).toBe(false);
    expect(isLivingPerson({ id: 'Q2' }, NOW)).toBe(false);
  });
});
