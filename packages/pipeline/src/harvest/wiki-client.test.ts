import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BATCH_SIZE, chunk, USER_AGENT, WikiApiError, WikiClient } from './wiki-client';

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };

/** A fake fetch that answers from a queue (or a function) and records each call. */
function fakeFetch(replies: Reply[] | ((url: URL) => Reply)) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const reply = typeof replies === 'function' ? replies(url) : replies.shift();
    if (!reply) throw new Error('unexpected request');
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: reply.headers,
    });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

function client(f: typeof fetch, extra: Partial<ConstructorParameters<typeof WikiClient>[0]> = {}) {
  let clock = 0;
  const sleeps: number[] = [];
  const c = new WikiClient({
    fetch: f,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    ...extra,
  });
  return { c, sleeps };
}

describe('WikiClient.getJson', () => {
  let cacheDir: string;
  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'fibble-wiki-'));
  });
  afterEach(() => rm(cacheDir, { recursive: true, force: true }));

  it('sends the descriptive User-Agent, JSON format params and maxlag', async () => {
    const { fetch, calls } = fakeFetch([{ body: { ok: 1 } }]);
    const { c } = client(fetch);
    await c.getJson('https://en.wikipedia.org/w/api.php', { action: 'query' });
    expect(calls[0]?.headers['User-Agent']).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/https:\/\/github\.com\/awoods187\/fibble/);
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual({
      action: 'query',
      format: 'json',
      formatversion: '2',
      maxlag: '5',
    });
  });

  it('serves a repeat request from the disk cache', async () => {
    const { fetch, calls } = fakeFetch([{ body: { n: 1 } }]);
    const { c } = client(fetch, { cacheDir });
    const first = await c.getJson('https://x.test/api', { a: '1' });
    const second = await c.getJson('https://x.test/api', { a: '1' });
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
    expect(c.stats).toEqual({ requests: 1, cacheHits: 1 });
    expect(await readdir(cacheDir)).toHaveLength(1);
  });

  it('spaces requests at least minIntervalMs apart', async () => {
    const { fetch } = fakeFetch([{ body: {} }, { body: {} }]);
    const { c, sleeps } = client(fetch, { minIntervalMs: 200 });
    await c.getJson('https://x.test/api', { a: '1' });
    await c.getJson('https://x.test/api', { a: '2' });
    expect(sleeps).toEqual([200]);
  });

  it('retries 503 and 429 using Retry-After, then succeeds', async () => {
    const { fetch, calls } = fakeFetch([
      { status: 503, headers: { 'retry-after': '3' } },
      { status: 429 },
      { body: { done: true } },
    ]);
    const { c, sleeps } = client(fetch, { minIntervalMs: 0 });
    expect(await c.getJson('https://x.test/api', {})).toEqual({ done: true });
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([3000, 2000]);
  });

  it('retries a maxlag API error but throws other API errors', async () => {
    const { fetch } = fakeFetch([
      { body: { error: { code: 'maxlag', info: 'lagged' } } },
      { body: { error: { code: 'missingtitle', info: 'no such page' } } },
    ]);
    const { c } = client(fetch, { minIntervalMs: 0 });
    const err = await c.getJson('https://x.test/api', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WikiApiError);
    expect(err).toMatchObject({ code: 'missingtitle' });
  });

  it('gives up after maxRetries and does not cache failures', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 503 }));
    const { c } = client(fetch, { minIntervalMs: 0, maxRetries: 2, cacheDir });
    await expect(c.getJson('https://x.test/api', {})).rejects.toThrow(/Gave up after 3 attempts/);
    expect(calls).toHaveLength(3);
    expect(await readdir(cacheDir)).toHaveLength(0);
  });

  it('throws straight away on a non-retryable HTTP error', async () => {
    const { fetch, calls } = fakeFetch([{ status: 404 }]);
    const { c } = client(fetch);
    await expect(c.getJson('https://x.test/api', {})).rejects.toThrow(/HTTP 404/);
    expect(calls).toHaveLength(1);
  });
});

describe('WikiClient API helpers', () => {
  it('archivePage returns the resolved title, revision and wikitext', async () => {
    const { fetch, calls } = fakeFetch([
      {
        body: {
          parse: {
            title: 'Wikipedia:Did you know archive/2024/May',
            revid: 7,
            wikitext: '* ... that x?',
          },
        },
      },
    ]);
    const { c } = client(fetch);
    expect(await c.archivePage('Wikipedia:Recent additions/2024/May')).toEqual({
      title: 'Wikipedia:Did you know archive/2024/May',
      revisionId: 7,
      wikitext: '* ... that x?',
    });
    expect(calls[0]?.url.searchParams.get('redirects')).toBe('1');
  });

  it('article returns revision, URL, text and Wikidata id', async () => {
    const { fetch } = fakeFetch([
      {
        body: {
          query: {
            pages: [
              {
                title: 'Spoon Monthly',
                ns: 0,
                lastrevid: 42,
                fullurl: 'https://en.wikipedia.org/wiki/Spoon_Monthly',
                extract: 'Lead.',
                pageprops: { wikibase_item: 'Q9' },
              },
            ],
          },
        },
      },
    ]);
    const { c } = client(fetch);
    expect(await c.article('Spoon Monthly')).toEqual({
      title: 'Spoon Monthly',
      url: 'https://en.wikipedia.org/wiki/Spoon_Monthly',
      revisionId: 42,
      extract: 'Lead.',
      wikidataId: 'Q9',
    });
  });

  it('article returns undefined for a missing page', async () => {
    const { fetch } = fakeFetch([
      { body: { query: { pages: [{ title: 'Nope', ns: 0, missing: true }] } } },
    ]);
    const { c } = client(fetch);
    expect(await c.article('Nope')).toBeUndefined();
  });

  it('wikidataIds follows normalisation and redirects back to the requested title', async () => {
    const { fetch } = fakeFetch([
      {
        body: {
          query: {
            normalized: [{ from: 'ada_Quill', to: 'Ada quill' }],
            redirects: [{ from: 'Ada quill', to: 'Ada Quill' }],
            pages: [
              { title: 'Ada Quill', pageprops: { wikibase_item: 'Q1' } },
              { title: 'Ten Spoons', pageprops: { wikibase_item: 'Q2' } },
              { title: 'No Item', pageprops: {} },
            ],
          },
        },
      },
    ]);
    const { c } = client(fetch);
    const ids = await c.wikidataIds(['ada_Quill', 'Ten Spoons', 'No Item']);
    expect([...ids]).toEqual([
      ['ada_Quill', 'Q1'],
      ['Ten Spoons', 'Q2'],
    ]);
  });

  it('wikidataIds batches titles 50 at a time', async () => {
    const { fetch, calls } = fakeFetch(() => ({ body: { query: { pages: [] } } }));
    const { c } = client(fetch, { minIntervalMs: 0 });
    await c.wikidataIds(Array.from({ length: BATCH_SIZE + 1 }, (_, i) => `T${i}`));
    expect(calls.map((x) => x.url.searchParams.get('titles')?.split('|').length)).toEqual([50, 1]);
  });

  it('entities skips missing ids', async () => {
    const { fetch, calls } = fakeFetch([
      { body: { entities: { Q1: { id: 'Q1', claims: {} }, Q404: { id: 'Q404', missing: '' } } } },
    ]);
    const { c } = client(fetch);
    const entities = await c.entities(['Q1', 'Q404', 'Q1']);
    expect(entities.map((e) => e.id)).toEqual(['Q1']);
    expect(calls[0]?.url.hostname).toBe('www.wikidata.org');
    expect(calls[0]?.url.searchParams.get('ids')).toBe('Q1|Q404');
  });
});

describe('chunk', () => {
  it('splits into fixed-size groups', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});

describe('WikiClient.searchArticles', () => {
  it('returns introductions best match first, skipping pages without text', async () => {
    const { fetch, calls } = fakeFetch([
      {
        body: {
          query: {
            pages: [
              { title: 'B', index: 2, fullurl: 'https://en.wikipedia.org/wiki/B', extract: 'b' },
              { title: 'A', index: 1, fullurl: 'https://en.wikipedia.org/wiki/A', extract: 'a' },
              { title: 'C', index: 3, fullurl: 'https://en.wikipedia.org/wiki/C' },
            ],
          },
        },
      },
    ]);
    const { c } = client(fetch);
    expect(await c.searchArticles('emu war', 3)).toEqual([
      { title: 'A', url: 'https://en.wikipedia.org/wiki/A', extract: 'a' },
      { title: 'B', url: 'https://en.wikipedia.org/wiki/B', extract: 'b' },
    ]);
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toMatchObject({
      generator: 'search',
      gsrsearch: 'emu war',
      gsrlimit: '3',
      gsrnamespace: '0',
      exintro: '1',
    });
  });

  it('returns an empty list when nothing matches', async () => {
    const { fetch } = fakeFetch([{ body: { batchcomplete: true } }]);
    const { c } = client(fetch);
    expect(await c.searchArticles('zzzz')).toEqual([]);
  });
});
