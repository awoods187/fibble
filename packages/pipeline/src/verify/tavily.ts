import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Tavily web search (ADR 0005), called with plain fetch. The key comes from the
 * caller (SEARCH_API_KEY) and is only ever sent in the Authorization header:
 * never logged, cached, put in an error message or written to a record.
 * Responses are cached on disk so eval re-runs don't spend search credits.
 */

export const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

export interface WebHit {
  title: string;
  url: string;
  content: string;
}

export interface TavilyOptions {
  apiKey: string;
  cacheDir?: string;
  maxRetries?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class TavilyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TavilyError';
  }
}

const TavilyResponse = z.object({
  results: z.array(
    z.object({ title: z.string().default(''), url: z.string(), content: z.string().default('') }),
  ),
});

export class TavilyClient {
  readonly stats = { searches: 0, cacheHits: 0 };
  private readonly opts: Required<Omit<TavilyOptions, 'cacheDir'>> & { cacheDir?: string };

  constructor(options: TavilyOptions) {
    if (!options.apiKey) throw new TavilyError('SEARCH_API_KEY is not set');
    this.opts = {
      apiKey: options.apiKey,
      cacheDir: options.cacheDir,
      maxRetries: options.maxRetries ?? 3,
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      sleep: options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    };
  }

  /** Top web results for a query. Wikipedia is excluded: CirrusSearch already covers it. */
  async search(query: string, maxResults = 3): Promise<WebHit[]> {
    const body = {
      query,
      max_results: maxResults,
      search_depth: 'basic',
      include_answer: false,
      exclude_domains: ['wikipedia.org'],
    };
    const key = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const cacheFile = this.opts.cacheDir ? join(this.opts.cacheDir, `${key}.json`) : undefined;
    if (cacheFile) {
      const cached = await readFile(cacheFile, 'utf8').catch(() => undefined);
      if (cached !== undefined) {
        this.stats.cacheHits++;
        return JSON.parse(cached) as WebHit[];
      }
    }

    for (let attempt = 0; ; attempt++) {
      this.stats.searches++;
      const res = await this.opts.fetch(TAVILY_SEARCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const parsed = TavilyResponse.safeParse(await res.json());
        if (!parsed.success) throw new TavilyError('Unexpected Tavily response shape');
        const hits = parsed.data.results.map(({ title, url, content }) => ({
          title,
          url,
          content,
        }));
        if (cacheFile && this.opts.cacheDir) {
          await mkdir(this.opts.cacheDir, { recursive: true });
          await writeFile(cacheFile, JSON.stringify(hits));
        }
        return hits;
      }
      const retryable = res.status === 429 || res.status >= 500;
      // Only the status goes in the message: never the request, its headers or the key.
      if (!retryable || attempt >= this.opts.maxRetries) {
        throw new TavilyError(`Tavily search failed with HTTP ${res.status}`);
      }
      await this.opts.sleep(1000 * 2 ** attempt);
    }
  }
}
