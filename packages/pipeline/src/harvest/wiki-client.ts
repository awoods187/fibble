import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { type WikidataEntity, WikidataEntitySchema } from './living';

/**
 * A small, polite client for the Wikipedia and Wikidata Action APIs
 * (PRD section 5, "API etiquette"):
 *  - a descriptive User-Agent with a contact address
 *  - one request at a time, at least `minIntervalMs` apart
 *  - maxlag=5, and backs off on 429/503 or a maxlag error
 *  - every successful response cached on disk, so a re-run makes no requests
 */

export const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
export const USER_AGENT =
  'FibbleBot/0.1 (https://github.com/awoods187/fibble; daily trivia content pipeline)';
/** Both APIs cap titles/ids per request at 50 for normal clients. */
export const BATCH_SIZE = 50;

export class WikiApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'WikiApiError';
  }
}

export interface WikiClientOptions {
  /** Directory for the response cache. Omit to disable caching. */
  cacheDir?: string;
  minIntervalMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface ArchivePage {
  title: string;
  revisionId: number;
  wikitext: string;
}

export interface ArticleData {
  title: string;
  url: string;
  revisionId: number;
  /** Plain text with "== Heading ==" lines. */
  extract: string;
  wikidataId?: string;
}

export interface FetchStats {
  requests: number;
  cacheHits: number;
}

const ParseResponse = z.object({
  parse: z.object({ title: z.string(), revid: z.number(), wikitext: z.string() }),
});

const TitleMap = z.array(z.object({ from: z.string(), to: z.string() })).optional();

const ArticleResponse = z.object({
  query: z.object({
    normalized: TitleMap,
    redirects: TitleMap,
    pages: z.array(
      z.object({
        title: z.string(),
        missing: z.boolean().optional(),
        invalid: z.boolean().optional(),
        ns: z.number().optional(),
        lastrevid: z.number().optional(),
        fullurl: z.string().optional(),
        extract: z.string().optional(),
        pageprops: z.object({ wikibase_item: z.string().optional() }).optional(),
      }),
    ),
  }),
});

const SearchResponse = z.object({
  query: z
    .object({
      pages: z.array(
        z.object({
          title: z.string(),
          index: z.number().optional(),
          fullurl: z.string().optional(),
          extract: z.string().optional(),
        }),
      ),
    })
    .optional(),
});

export interface SearchHit {
  title: string;
  url: string;
  /** The article's plain-text introduction. */
  extract: string;
}

const EntitiesResponse = z.object({
  entities: z.record(z.string(), WikidataEntitySchema.extend({ missing: z.string().optional() })),
});

const ApiErrorBody = z.object({
  error: z.object({ code: z.string(), info: z.string().optional() }),
});

export class WikiClient {
  readonly stats: FetchStats = { requests: 0, cacheHits: 0 };
  private readonly opts: Required<Omit<WikiClientOptions, 'cacheDir'>> & { cacheDir?: string };
  private lastRequestAt = Number.NEGATIVE_INFINITY;

  constructor(options: WikiClientOptions = {}) {
    this.opts = {
      cacheDir: options.cacheDir,
      minIntervalMs: options.minIntervalMs ?? 200,
      maxRetries: options.maxRetries ?? 4,
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      sleep: options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      now: options.now ?? Date.now,
    };
  }

  /** GET an Action API URL as JSON, from cache when possible. */
  async getJson(base: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(base);
    const all: Record<string, string> = { format: 'json', formatversion: '2', ...params };
    for (const key of Object.keys(all).sort()) url.searchParams.set(key, all[key] ?? '');
    const href = url.toString();

    const cacheFile = this.opts.cacheDir
      ? join(this.opts.cacheDir, `${createHash('sha256').update(href).digest('hex')}.json`)
      : undefined;
    if (cacheFile) {
      const cached = await readFile(cacheFile, 'utf8').catch(() => undefined);
      if (cached !== undefined) {
        this.stats.cacheHits++;
        return JSON.parse(cached);
      }
    }

    // maxlag only on the live request; it isn't part of the cache key.
    url.searchParams.set('maxlag', '5');
    const body = await this.fetchWithRetry(url.toString());
    if (cacheFile && this.opts.cacheDir) {
      await mkdir(this.opts.cacheDir, { recursive: true });
      await writeFile(cacheFile, JSON.stringify(body));
    }
    return body;
  }

  private async fetchWithRetry(href: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.lastRequestAt + this.opts.minIntervalMs - this.opts.now();
      if (wait > 0) await this.opts.sleep(wait);
      this.lastRequestAt = this.opts.now();
      this.stats.requests++;

      const res = await this.opts.fetch(href, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
      let retryAfterSec = Number(res.headers.get('retry-after'));
      if (res.ok) {
        const body: unknown = await res.json();
        const apiError = ApiErrorBody.safeParse(body);
        if (!apiError.success) return body;
        // A maxlag error means the servers are busy: wait and retry like a 503.
        if (apiError.data.error.code !== 'maxlag') {
          throw new WikiApiError(
            `${apiError.data.error.code}: ${apiError.data.error.info ?? 'API error'}`,
            apiError.data.error.code,
          );
        }
      } else if (res.status !== 429 && res.status !== 503) {
        throw new WikiApiError(`HTTP ${res.status} for ${href}`);
      }

      if (attempt >= this.opts.maxRetries) {
        throw new WikiApiError(`Gave up after ${attempt + 1} attempts: ${href}`);
      }
      if (!Number.isFinite(retryAfterSec) || retryAfterSec <= 0) retryAfterSec = 2 ** attempt;
      await this.opts.sleep(retryAfterSec * 1000);
    }
  }

  /** Wikitext and revision of a project page, following redirects (DYK archives were renamed). */
  async archivePage(title: string): Promise<ArchivePage> {
    const data = ParseResponse.parse(
      await this.getJson(WIKIPEDIA_API, {
        action: 'parse',
        page: title,
        prop: 'wikitext|revid',
        redirects: '1',
      }),
    );
    return { title: data.parse.title, revisionId: data.parse.revid, wikitext: data.parse.wikitext };
  }

  /** Current revision, URL, plain text and Wikidata item of one article; undefined if missing. */
  async article(title: string): Promise<ArticleData | undefined> {
    const data = ArticleResponse.parse(
      await this.getJson(WIKIPEDIA_API, {
        action: 'query',
        titles: title,
        prop: 'info|extracts|pageprops',
        inprop: 'url',
        explaintext: '1',
        exsectionformat: 'wiki',
        ppprop: 'wikibase_item',
        redirects: '1',
      }),
    );
    const page = data.query.pages[0];
    if (!page || page.missing || page.invalid || page.ns !== 0) return undefined;
    if (!page.lastrevid || !page.fullurl || !page.extract) return undefined;
    return {
      title: page.title,
      url: page.fullurl,
      revisionId: page.lastrevid,
      extract: page.extract,
      wikidataId: page.pageprops?.wikibase_item,
    };
  }

  /**
   * Full-text search (CirrusSearch) returning the top articles' introductions, best match first.
   * A search with no results returns an empty list.
   */
  async searchArticles(query: string, limit = 3): Promise<SearchHit[]> {
    const data = SearchResponse.parse(
      await this.getJson(WIKIPEDIA_API, {
        action: 'query',
        generator: 'search',
        gsrsearch: query,
        gsrlimit: String(limit),
        gsrnamespace: '0',
        prop: 'extracts|info',
        exintro: '1',
        explaintext: '1',
        exlimit: String(limit),
        inprop: 'url',
        redirects: '1',
      }),
    );
    return (data.query?.pages ?? [])
      .filter((p) => p.fullurl && p.extract)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((p) => ({ title: p.title, url: p.fullurl ?? '', extract: p.extract ?? '' }));
  }

  /** Map each requested title (as given) to its Wikidata item, following normalisation and redirects. */
  async wikidataIds(titles: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const batch of chunk([...new Set(titles)], BATCH_SIZE)) {
      const data = ArticleResponse.parse(
        await this.getJson(WIKIPEDIA_API, {
          action: 'query',
          titles: batch.join('|'),
          prop: 'pageprops',
          ppprop: 'wikibase_item',
          redirects: '1',
        }),
      );
      const forward = new Map<string, string>();
      for (const m of [...(data.query.normalized ?? []), ...(data.query.redirects ?? [])]) {
        forward.set(m.from, m.to);
      }
      const byTitle = new Map(
        data.query.pages.flatMap((p) =>
          p.pageprops?.wikibase_item ? [[p.title, p.pageprops.wikibase_item] as const] : [],
        ),
      );
      for (const title of batch) {
        let resolved = title;
        for (let hops = 0; hops < 3 && forward.has(resolved); hops++) {
          resolved = forward.get(resolved) ?? resolved;
        }
        const id = byTitle.get(resolved);
        if (id) result.set(title, id);
      }
    }
    return result;
  }

  /** Wikidata entities with their claims, in batches. Missing ids are skipped. */
  async entities(ids: string[]): Promise<WikidataEntity[]> {
    const out: WikidataEntity[] = [];
    for (const batch of chunk([...new Set(ids)], BATCH_SIZE)) {
      const data = EntitiesResponse.parse(
        await this.getJson(WIKIDATA_API, {
          action: 'wbgetentities',
          ids: batch.join('|'),
          props: 'claims',
        }),
      );
      for (const { missing, ...entity } of Object.values(data.entities)) {
        if (missing === undefined) out.push(entity);
      }
    }
    return out;
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
