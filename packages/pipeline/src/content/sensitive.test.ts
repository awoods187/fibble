import { describe, expect, it } from 'vitest';
import { describeSensitive, findSensitive } from './sensitive';

describe('findSensitive', () => {
  it('catches a statement like the one a reviewer flagged (a Nazi-themed school parade)', () => {
    const hits = findSensitive(
      'A school principal resigned in 2016 after students marched in a parade with Nazi uniforms.',
    );
    expect(hits).toEqual([{ topic: 'extremism', match: 'nazi' }]);
  });

  it.each([
    ['extremism', 'neo-nazis', 'The rally was organised by neo-Nazis.'],
    ['extremism', 'hitler', "Hitler's favourite film was shown twice."],
    ['extremism', 'swastika', 'A swastika was painted on the gate.'],
    ['extremism', 'fascist', 'The fascist party won the vote.'],
    ['extremism', 'ku klux klan', 'The Ku Klux Klan held a picnic.'],
    ['atrocity', 'genocide', 'The genocide was later commemorated.'],
    ['atrocity', 'holocaust', 'A Holocaust survivor wrote the score.'],
    ['atrocity', 'massacre', 'The massacre led to a new law.'],
    ['atrocity', 'concentration camp', 'He was held in a concentration camp.'],
    ['atrocity', 'terrorist', 'After a terrorist attack, the bridge closed.'],
    ['atrocity', 'terror attack', 'After a terror attack, the bridge closed.'],
    ['racism', 'racist', 'A racist poster was withdrawn.'],
    ['racism', 'slavery', 'The estate was built with profits from slavery.'],
    ['racism', 'enslaved', 'Enslaved workers built the dam.'],
    ['racism', 'apartheid', 'Under apartheid, the stadium was split.'],
    ['racism', 'lynching', 'A lynching was reported in the paper.'],
    ['racism', 'eugenics', 'The society promoted eugenics.'],
  ])('flags %s ("%s")', (topic, match, text) => {
    expect(findSensitive(text)).toContainEqual({ topic, match });
  });

  it('does not flag ordinary words that merely look similar', () => {
    for (const text of [
      'The SS Great Britain was the first iron steamship to cross the Atlantic.',
      'A massive Slavic folk choir performed at the racing festival.',
      'Racial is not in the list, and nor is a racecourse or a navy.',
      'Cathedral masses were held on the Massachusetts coast.',
    ]) {
      expect(findSensitive(text), text).toEqual([]);
    }
  });

  it('searches several texts at once and de-duplicates matches', () => {
    const hits = findSensitive('Nazi gold.', 'More Nazi gold and a massacre.');
    expect(hits).toEqual([
      { topic: 'extremism', match: 'nazi' },
      { topic: 'atrocity', match: 'massacre' },
    ]);
    expect(describeSensitive(hits)).toBe(
      'Sensitive topic: extremism ("nazi"), atrocity ("massacre")',
    );
  });
});
