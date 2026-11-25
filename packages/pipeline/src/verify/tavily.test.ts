import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TAVILY_SEARCH_URL, TavilyClient, TavilyError } from './tavily';

// Built at runtime so this file never holds a key-shaped string.
const KEY = ['tvly', 'test', 'K'.repeat(24)].join('-');

function fakeFetch(replies: { status?: number; body?: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = replies.shift();
    if (!r) throw new Error('unexpected request');
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const RESULTS = {
  results: [{ title: 'T', url: 'https://example.org/a', content: 'C', score: 0.9 }],
};

describe('TavilyClient', () => {
  let cacheDir: string;
  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'fibble-tavily-'));
  });
  afterEach(() => rm(cacheDir, { recursive: true, force: true }));

  it('refuses to start without a key', () => {
    expect(() => new TavilyClient({ apiKey: '' })).toThrow(TavilyError);
  });

  it('POSTs the query with a bearer key and excludes Wikipedia', async () => {
    const { fetch, calls } = fakeFetch([{ body: RESULTS }]);
    const hits = await new TavilyClient({ apiKey: KEY, fetch }).search('emu war', 2);
    expect(hits).toEqual([{ title: 'T', url: 'https://example.org/a', content: 'C' }]);
    expect(calls[0]?.url).toBe(TAVILY_SEARCH_URL);
    expect(calls[0]?.init.method).toBe('POST');
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      query: 'emu war',
      max_results: 2,
      exclude_domains: ['wikipedia.org'],
    });
  });

  it('caches results on disk, and the cache never contains the key', async () => {
    const { fetch, calls } = fakeFetch([{ body: RESULTS }]);
    const client = new TavilyClient({ apiKey: KEY, fetch, cacheDir });
    await client.search('q');
    await client.search('q');
    expect(calls).toHaveLength(1);
    expect(client.stats).toEqual({ searches: 1, cacheHits: 1 });
    const [file] = await readdir(cacheDir);
    expect(await readFile(join(cacheDir, file ?? ''), 'utf8')).not.toContain(KEY);
  });

  it('retries 429 and 5xx, then succeeds', async () => {
    const { fetch, calls } = fakeFetch([{ status: 429 }, { status: 503 }, { body: RESULTS }]);
    const sleep = vi.fn(async () => {});
    await new TavilyClient({ apiKey: KEY, fetch, sleep }).search('q');
    expect(calls).toHaveLength(3);
    expect(sleep.mock.calls).toEqual([[1000], [2000]]);
  });

  it('fails with only the status in the message, never the key', async () => {
    const { fetch } = fakeFetch([{ status: 401, body: { detail: `bad key ${KEY}` } }]);
    const err = await new TavilyClient({ apiKey: KEY, fetch }).search('q').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TavilyError);
    expect(String((err as Error).message)).toBe('Tavily search failed with HTTP 401');
    expect(JSON.stringify(err)).not.toContain(KEY);
  });
});
