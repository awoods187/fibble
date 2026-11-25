import { describe, expect, it } from 'vitest';
import type { LieCandidate } from '../generate/schemas';
import type { RewordedTruth } from '../types';
import {
  buildRatingPage,
  buildRatingSet,
  embedJson,
  RatingsFileSchema,
  seededShuffle,
} from './page';
import { ratingReport } from './report';

// Made-up content; no real Wikipedia text.
const truth = (id: string, text: string): RewordedTruth => ({
  candidateId: id,
  category: 'History',
  text,
  expansion: 'x',
  source: { title: 'T', url: 'https://en.wikipedia.org/wiki/T', revisionId: 1 },
  supportingSentence: 'x',
  entities: [],
  scores: { surprise: 4, verifiability: 4 },
  entailment: { supported: true, unsupportedDetails: [] },
  usage: [],
  trace: { stage: 'reword', promptVersion: 'x', createdAt: '2026-11-25T00:00:00.000Z' },
});
const lie = (id: string, text: string): LieCandidate => ({
  id,
  category: 'History',
  text,
  lieNote: 'n',
  borrowedTexture: 'b',
  basedOnTruthIds: ['t1', 't2'],
  trace: { stage: 'generateLies', promptVersion: 'x', createdAt: '2026-11-25T00:00:00.000Z' },
});
const TRUTHS = [
  truth('dyk-1', 'A lighthouse ran on candles until 1931.'),
  truth('dyk-2', 'A town paid fishermen in herring.'),
];
const LIES = [
  lie('lie-abc', 'A ferry paid rowers in brass tokens.'),
  lie('lie-def', 'A guild fined late <bell> ringers & "others".'),
];

describe('buildRatingSet', () => {
  const set = buildRatingSet(TRUTHS, LIES, 'seed-1');

  it('includes every statement once, with opaque ids that hide truth or lie', () => {
    expect(set.items.map((i) => i.text).sort()).toEqual(
      [...TRUTHS, ...LIES].map((x) => x.text).sort(),
    );
    for (const item of set.items) {
      expect(item.id).toMatch(/^s-[0-9a-f]{10}$/);
      expect(item).not.toHaveProperty('expected');
    }
  });

  it('keeps the answers in a separate key', () => {
    const byText = new Map(set.items.map((i) => [i.text, set.key[i.id]]));
    expect(byText.get(TRUTHS[0]!.text)).toEqual({ expected: 'truth', sourceId: 'dyk-1' });
    expect(byText.get(LIES[0]!.text)).toEqual({ expected: 'lie', sourceId: 'lie-abc' });
  });

  it('is deterministic for a seed and shuffles differently for another', () => {
    expect(buildRatingSet(TRUTHS, LIES, 'seed-1')).toEqual(set);
    const many = Array.from({ length: 20 }, (_, i) => i);
    expect(seededShuffle(many, 'a')).not.toEqual(seededShuffle(many, 'b'));
    expect([...seededShuffle(many, 'a')].sort((x, y) => x - y)).toEqual(many);
  });
});

describe('buildRatingPage', () => {
  const set = buildRatingSet(TRUTHS, LIES, 'seed-1');
  const html = buildRatingPage(set);

  it('never puts the answers or source ids in the page', () => {
    for (const leak of ['"truth"', '"lie"', 'expected', 'dyk-1', 'lie-abc', 'sourceId']) {
      expect(html).not.toContain(leak);
    }
  });

  it('forbids network requests with its CSP and has no external resources', () => {
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/(src|href)=["']https?:/);
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|navigator\.sendBeacon/);
  });

  it('embeds statement text safely, so a statement cannot close the script tag', () => {
    expect(html).not.toContain('<bell>');
    expect(html).toContain('\\u003cbell\\u003e');
    expect(embedJson('</script><x>&\u2028')).toBe(
      '"\\u003c/script\\u003e\\u003cx\\u003e\\u0026\\u2028"',
    );
  });
});

describe('ratingReport', () => {
  const set = buildRatingSet(TRUTHS, LIES, 'seed-1');
  const idOf = (sourceId: string) =>
    Object.entries(set.key).find(([, v]) => v.sourceId === sourceId)?.[0] ?? '';
  const ratings = RatingsFileSchema.parse({
    setId: set.setId,
    ratedAt: '2026-11-25T12:00:00Z',
    ratings: [
      { id: idOf('dyk-1'), plausibility: 4, fun: 'great', knew: false },
      { id: idOf('dyk-2'), plausibility: 5, fun: 'boring', knew: true },
      { id: idOf('lie-abc'), plausibility: 4, fun: 'fine', knew: false },
      { id: idOf('lie-def'), plausibility: 2, knew: false },
    ],
  });
  const report = ratingReport(
    set.key,
    ratings,
    new Map([
      ['lie-abc', 2],
      ['lie-def', 2],
    ]),
  );

  it('summarises truths and lies, leaving out statements the rater already knew', () => {
    expect(report).toMatchObject({ rated: 4, knewExcluded: 1 });
    expect(report.truths).toMatchObject({ n: 1, mean: 4, passRate: 1 });
    expect(report.lies).toMatchObject({ n: 2, mean: 3, passRate: 0.5, dist: { 2: 1, 4: 1 } });
  });

  it('compares the model with the human on each lie', () => {
    expect(report).toMatchObject({
      compared: 2,
      meanModelMinusHuman: -1,
      bothPass: 0,
      humanOnlyPass: 1,
      modelOnlyPass: 0,
      neitherPass: 1,
    });
  });

  it('reports "good for the game" separately, counting already-known statements too', () => {
    expect(report.fun.truths).toMatchObject({
      rated: 2,
      great: 1,
      boring: 1,
      greatRate: 0.5,
      boringRate: 0.5,
    });
    expect(report.fun.lies).toMatchObject({ rated: 1, fine: 1, greatRate: 0 });
  });

  it('still reads version 1 files, which have no fun rating', () => {
    const v1 = RatingsFileSchema.parse({
      setId: set.setId,
      ratedAt: 'x',
      ratings: [{ id: idOf('dyk-1'), plausibility: 3, knew: false }],
    });
    expect(ratingReport(set.key, v1, new Map()).fun.truths.rated).toBe(0);
  });
});

describe('two-question page', () => {
  const html = buildRatingPage(buildRatingSet(TRUTHS, LIES, 'seed-1'));

  it('asks believability and game fit as separate questions', () => {
    expect(html).toContain('Believable?');
    expect(html).toContain('Good for the game?');
    for (const label of ['Obviously made up', 'Definitely sounds true', 'Boring', 'Great']) {
      expect(html).toContain(label);
    }
    // The v1 label that mixed believability with being interesting is gone.
    expect(html).not.toContain('Surprising but real-sounding');
  });
});
