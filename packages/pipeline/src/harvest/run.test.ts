import { describe, expect, it } from 'vitest';
import { CandidateSchema } from '../schemas';
import type { StageContext } from '../types';
import type { WikidataEntity } from './living';
import { candidateId, harvestDyk } from './run';
import type { ArticleData, WikiClient } from './wiki-client';

const CTX: StageContext = {
  promptVersion: 'none',
  dryRun: false,
  now: new Date('2026-11-25T12:00:00Z'),
};

// Made-up hooks and articles; no network, no real Wikipedia content.
const ARCHIVES: Record<string, string> = {
  'Wikipedia:Did you know archive/2024/May': [
    "* ... that '''[[Glass Lighthouse of Vell]]''' was lit by candles until 1931?",
    "* ... that the poet [[Ada Quill]] once reviewed '''[[Spoon Monthly]]''' in verse?",
    '* ... that this hook has no bold subject?',
    "* ... that '''[[Deleted Page]]''' no longer exists?",
  ].join('\n'),
  'Wikipedia:Did you know archive/2024/June':
    "* ... that '''[[Ten Spoons]]''' is a novel about cutlery?",
};

const ARTICLES: Record<string, ArticleData> = Object.fromEntries(
  ['Glass Lighthouse of Vell', 'Spoon Monthly', 'Ten Spoons'].map((title, i) => [
    title,
    {
      title,
      url: `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}`,
      revisionId: 100 + i,
      extract: `${title} is an imaginary thing.\n\n== History ==\nCandles were used until 1931.`,
      wikidataId: `Q${i + 10}`,
    },
  ]),
);

const PEOPLE: Record<string, WikidataEntity> = {
  'Ada Quill': {
    id: 'Q1',
    claims: { P31: [{ mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q5' } } } }] },
  },
};

function fakeClient() {
  const articleCalls: string[] = [];
  const client = {
    archivePage: async (title: string) => {
      const wikitext = ARCHIVES[title];
      if (wikitext === undefined) throw new Error(`missing archive ${title}`);
      return { title, revisionId: 1, wikitext };
    },
    article: async (title: string) => {
      articleCalls.push(title);
      return ARTICLES[title];
    },
    wikidataIds: async (titles: string[]) =>
      new Map(titles.flatMap((t) => (PEOPLE[t] ? [[t, PEOPLE[t].id] as const] : []))),
    entities: async (ids: string[]) => Object.values(PEOPLE).filter((e) => ids.includes(e.id)),
  };
  return { client: client as unknown as WikiClient, articleCalls };
}

describe('harvestDyk', () => {
  it('builds schema-valid candidates across months and counts what it skipped', async () => {
    const { client } = fakeClient();
    const { candidates, stats } = await harvestDyk(
      { source: 'dyk', months: ['2024-05', '2024-06'], limit: 10 },
      CTX,
      client,
    );

    expect(candidates.map((c) => c.article.title)).toEqual([
      'Glass Lighthouse of Vell',
      'Spoon Monthly',
      'Ten Spoons',
    ]);
    for (const c of candidates) expect(CandidateSchema.safeParse(c).success).toBe(true);
    expect(stats).toEqual({
      months: 2,
      hooks: 5,
      candidates: 3,
      livingPerson: 1,
      skipped: { 'no-subject': 1, 'missing-article': 1, 'empty-context': 0 },
    });
  });

  it('records the article revision, evidence text and trace', async () => {
    const { client } = fakeClient();
    const [first] = (
      await harvestDyk({ source: 'dyk', months: ['2024-05'], limit: 1 }, CTX, client)
    ).candidates;
    expect(first).toEqual({
      id: candidateId(
        '2024-05',
        '... that Glass Lighthouse of Vell was lit by candles until 1931?',
      ),
      harvestedFrom: 'dyk',
      month: '2024-05',
      rawClaim: '... that Glass Lighthouse of Vell was lit by candles until 1931?',
      article: {
        title: 'Glass Lighthouse of Vell',
        url: 'https://en.wikipedia.org/wiki/Glass_Lighthouse_of_Vell',
        revisionId: 100,
      },
      contextText:
        'Glass Lighthouse of Vell is an imaginary thing.\n\n== History ==\nCandles were used until 1931.',
      involvesLivingPerson: false,
      livingPeople: [],
      trace: { stage: 'harvest', promptVersion: 'none', createdAt: '2026-11-25T12:00:00.000Z' },
    });
  });

  it('flags a hook that links a living person, even when they are not the subject', async () => {
    const { client } = fakeClient();
    const { candidates } = await harvestDyk(
      { source: 'dyk', months: ['2024-05'], limit: 2 },
      CTX,
      client,
    );
    expect(candidates[1]).toMatchObject({
      article: { title: 'Spoon Monthly' },
      involvesLivingPerson: true,
      livingPeople: ['Ada Quill'],
    });
  });

  it('stops at the limit without fetching more articles or months', async () => {
    const { client, articleCalls } = fakeClient();
    const { candidates, stats } = await harvestDyk(
      { source: 'dyk', months: ['2024-05', '2024-06'], limit: 1 },
      CTX,
      client,
    );
    expect(candidates).toHaveLength(1);
    expect(articleCalls).toEqual(['Glass Lighthouse of Vell']);
    expect(stats.months).toBe(1);
  });

  it('gives the same id for the same hook and month on every run', () => {
    expect(candidateId('2024-05', 'x')).toBe(candidateId('2024-05', 'x'));
    expect(candidateId('2024-05', 'x')).not.toBe(candidateId('2024-06', 'x'));
    expect(candidateId('2024-05', 'x')).toMatch(/^dyk-2024-05-[0-9a-f]{10}$/);
  });

  it('rejects a source that is not built yet', async () => {
    const { client } = fakeClient();
    await expect(
      harvestDyk({ source: 'unusual-articles', months: [], limit: 1 }, CTX, client),
    ).rejects.toThrow(/not implemented/);
  });
});
