import { describe, expect, it } from 'vitest';
import { CandidateSchema } from '../schemas';
import type { StageContext } from '../types';
import type { WikidataEntity } from './living';
import {
  EXCLUDED_UNUSUAL_TOPICS,
  harvestUnusual,
  parseUnusualTable,
  UNUSUAL_TOPICS,
  unusualCandidateId,
  parseTopics as parse,
} from './unusual';
import type { ArticleData, WikiClient } from './wiki-client';

// Made-up rows in the real wikitable format; no real Wikipedia text.
const TABLE = `Intro text.
{| class="wikitable"
|-
| width="30%" | '''[[Goat Spire of Vell]]'''
| width="70%" | A tower built only for goats to climb.
|-
| {{icon|GA}} '''[[Pudding Race|The Pudding Race]]'''
| A race run while balancing a pudding, invented by [[Ada Quill]].
|-
| '''[[Category:Things]]'''
| Not an article.
|-
| '''[[Goat Spire of Vell]]'''
| A duplicate row.
|-
| Only one cell
|}`;

describe('parseUnusualTable', () => {
  const entries = parseUnusualTable(TABLE);

  it('reads the bold article and the blurb from each row', () => {
    expect(entries.map((e) => [e.title, e.blurb])).toEqual([
      ['Goat Spire of Vell', 'A tower built only for goats to climb.'],
      ['Pudding Race', 'A race run while balancing a pudding, invented by Ada Quill.'],
    ]);
  });

  it('collects the links for the living-person check, title first', () => {
    expect(entries[1]?.links).toEqual(['Pudding Race', 'Ada Quill']);
  });
});

describe('topics', () => {
  it('maps each used topic to a Fibble category and never uses an excluded one', () => {
    expect(UNUSUAL_TOPICS.Sports).toBe('Sports & Games');
    expect(UNUSUAL_TOPICS['Places and infrastructure']).toBe('Geography & Places');
    for (const t of EXCLUDED_UNUSUAL_TOPICS) expect(UNUSUAL_TOPICS[t]).toBeUndefined();
    expect(new Set(Object.values(UNUSUAL_TOPICS)).size).toBe(5);
  });

  it('gives a stable id per topic and article', () => {
    expect(unusualCandidateId('Places and infrastructure', 'X')).toMatch(
      /^ua-places-and-infrastructure-[0-9a-f]{10}$/,
    );
    expect(unusualCandidateId('Sports', 'X')).toBe(unusualCandidateId('Sports', 'X'));
  });
});

describe('harvestUnusual', () => {
  const CTX: StageContext = {
    promptVersion: 'none',
    dryRun: false,
    now: new Date('2026-11-25T12:00:00Z'),
  };
  const article = (title: string): ArticleData => ({
    title,
    url: `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}`,
    revisionId: 7,
    extract: `${title} is an imaginary thing.\n\n== History ==\nIt began in 1901.`,
  });
  const living: WikidataEntity = {
    id: 'Q1',
    claims: { P31: [{ mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q5' } } } }] },
  };
  const client = {
    archivePage: async (title: string) => ({
      title,
      revisionId: 1,
      wikitext:
        title === 'Wikipedia:Unusual articles/Sports'
          ? TABLE
          : `{|\n|-\n| '''[[Massacre Hill]]'''\n| A hill with a grim name.\n|-\n| '''[[Lantern Bridge]]'''\n| A bridge lit by lanterns.\n|}`,
    }),
    article: async (title: string) => article(title),
    wikidataIds: async (titles: string[]) =>
      new Map(titles.filter((t) => t === 'Ada Quill').map((t) => [t, 'Q1'])),
    entities: async () => [living],
  } as unknown as WikiClient;

  it('builds schema-valid candidates with the topic and category hint', async () => {
    const { candidates, stats } = await harvestUnusual(
      { topics: ['Sports', 'Places and infrastructure'], limit: 5, seed: 's' },
      CTX,
      client,
    );
    for (const c of candidates) expect(CandidateSchema.safeParse(c).success).toBe(true);
    const sports = candidates.filter((c) => c.topic === 'Sports');
    expect(sports.map((c) => c.categoryHint)).toEqual(['Sports & Games', 'Sports & Games']);
    expect(candidates.find((c) => c.article.title === 'Lantern Bridge')).toMatchObject({
      harvestedFrom: 'unusual-articles',
      categoryHint: 'Geography & Places',
      rawClaim: 'Lantern Bridge: A bridge lit by lanterns.',
    });
    // The banned-topic blurb is skipped before any article fetch; the living person is flagged.
    expect(candidates.map((c) => c.article.title)).not.toContain('Massacre Hill');
    expect(stats.sensitive).toBe(1);
    expect(candidates.find((c) => c.article.title === 'Pudding Race')?.livingPeople).toEqual([
      'Ada Quill',
    ]);
  });

  it('takes at most `limit` per topic and skips articles already harvested', async () => {
    const { candidates } = await harvestUnusual(
      {
        topics: ['Sports'],
        limit: 1,
        seed: 's',
        skipTitles: new Set(['Goat Spire of Vell', 'Pudding Race']),
      },
      CTX,
      client,
    );
    expect(candidates).toEqual([]);
    const one = await harvestUnusual({ topics: ['Sports'], limit: 1, seed: 's' }, CTX, client);
    expect(one.candidates).toHaveLength(1);
  });

  it('refuses an excluded topic', async () => {
    await expect(
      harvestUnusual({ topics: ['Death'], limit: 1, seed: 's' }, CTX, client),
    ).rejects.toThrow(/excluded/);
  });
});

describe('parseTopics', () => {
  it('keeps topic names that contain a comma whole', () => {
    expect(parse('Sports,Technology, inventions and products,History')).toEqual([
      'Sports',
      'Technology, inventions and products',
      'History',
    ]);
    expect(parse('Popular culture, entertainment and the arts')).toEqual([
      'Popular culture, entertainment and the arts',
    ]);
    expect(parse('Technology,inventions and products')).toEqual([
      'Technology, inventions and products',
    ]);
  });

  it('passes unknown or unfinished names through so validation rejects them', () => {
    expect(parse('Sports, Nope')).toEqual(['Sports', 'Nope']);
    expect(parse('Technology, Sports')).toEqual(['Technology', 'Sports']);
    expect(parse('Technology')).toEqual(['Technology']);
  });
});
