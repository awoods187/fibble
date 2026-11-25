import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { ArticleData, SearchHit, WikiClient } from '../harvest/wiki-client';
import {
  Budget,
  type CallUsage,
  type LlmClient,
  type StructuredRequest,
  type StructuredResult,
} from '../llm';
import { parsePrompt } from '../prompts';
import type { StageContext } from '../types';
import { formatEvidence, mergeEvidence, passes, verifyLies } from './run';
import { type Evidence, type LieInput, VerifiedLieSchema } from './schemas';
import type { TavilyClient, WebHit } from './tavily';

const CTX: StageContext = {
  promptVersion: 'none',
  dryRun: false,
  now: new Date('2026-11-25T12:00:00Z'),
};
const PROMPTS = {
  plausibility: parsePrompt('plausibility', 'test-v1', '# System\nP\n# User\n{{statement}}'),
  queries: parsePrompt('verify-queries', 'test-v1', '# System\nQ\n# User\n{{statement}}'),
  judge: parsePrompt('verify-judge', 'test-v1', '# System\nJ\n# User\n{{statement}}\n{{evidence}}'),
};
const LIE: LieInput = {
  id: 'l1',
  category: 'History',
  text: 'In 1859 Sweden held a lottery for a lighthouse.',
};

const usage = (model: CallUsage['model'], usd: number): CallUsage => ({
  model,
  inputTokens: 10,
  outputTokens: 5,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  usd,
});
type Reply = StructuredResult<unknown>;
const plausible = (plausibility = 4): Reply => ({
  ok: true,
  output: { plausibility, reason: ' Specific and natural. ' },
  usage: usage('claude-sonnet-5-5', 0.002),
});
const queriesReply = (queries: string[]): Reply => ({
  ok: true,
  output: { queries },
  usage: usage('claude-haiku-5-5', 0.001),
});
const judgeReply = (label: string, citedEvidence = [1]): Reply => ({
  ok: true,
  output: { label, rationale: ' Because. ', citedEvidence },
  usage: usage('claude-sonnet-5-5', 0.02),
});
const failed = (reason: 'refusal' | 'unparseable', model: CallUsage['model']): Reply => ({
  ok: false,
  reason,
  usage: usage(model, 0.001),
});

// Made-up content; no real Wikipedia text.
const WIKI: SearchHit[] = [
  {
    title: 'Swedish lotteries',
    url: 'https://en.wikipedia.org/wiki/SL',
    extract: 'Lotteries in Sweden.',
  },
];
const ARTICLE: ArticleData = {
  title: 'Swedish lotteries',
  url: 'https://en.wikipedia.org/wiki/SL',
  revisionId: 1,
  extract:
    'Lotteries in Sweden have a long history.\n\n== Sports ==\nFootball pools began in 1934.\n\n== Lighthouses ==\nIn 1859 a lottery raised money for a lighthouse.',
  wikidataId: 'Q1',
};
const WEB: WebHit[] = [
  { title: 'Lighthouses', url: 'https://example.org/lh', content: 'A history of lighthouses.' },
];

interface FakeOpts {
  wikiFails?: boolean;
  articleFails?: boolean;
  webFails?: boolean;
}

function fakes(replies: Reply[], wikiHits = WIKI, webHits = WEB, opts: FakeOpts = {}) {
  const requests: StructuredRequest<z.ZodType>[] = [];
  const llm: LlmClient = {
    structured: async (req) => {
      requests.push(req);
      const r = replies.shift();
      if (!r) throw new Error('unexpected LLM call');
      return r as never;
    },
  };
  const searched: string[] = [];
  const wiki = {
    searchArticles: async (q: string) => {
      searched.push(`wiki:${q}`);
      if (opts.wikiFails) throw new Error('wiki down');
      return wikiHits;
    },
    article: async () => {
      if (opts.articleFails) throw new Error('article down');
      return ARTICLE;
    },
  } as unknown as WikiClient;
  const tavilyStats = { searches: 0, cacheHits: 0 };
  const tavily = {
    stats: tavilyStats,
    search: async (q: string) => {
      searched.push(`web:${q}`);
      tavilyStats.searches++;
      if (opts.webFails) throw new Error('Tavily search failed with HTTP 500');
      return webHits;
    },
  } as unknown as TavilyClient;
  return { llm, wiki, tavily, requests, searched };
}

const run = (f: ReturnType<typeof fakes>, lies = [LIE], budgetUsd = 10) =>
  verifyLies(lies, CTX, {
    llm: f.llm,
    prompts: PROMPTS,
    wiki: f.wiki,
    tavily: f.tavily,
    budget: new Budget(budgetUsd),
  });

describe('verifyLies', () => {
  it('rates plausibility, writes queries, searches both sources, and passes a contradicted lie', async () => {
    const f = fakes([
      plausible(4),
      queriesReply(['sweden lottery 1859', 'swedish lighthouses']),
      judgeReply('contradicted', [1, 2, 9]),
    ]);
    const { verified, stats } = await run(f);
    const v = VerifiedLieSchema.parse(verified[0]);
    expect(v).toMatchObject({
      passed: true,
      label: 'contradicted',
      plausibility: 4,
      plausibilityReason: 'Specific and natural.',
      judgeRationale: 'Because.',
      citedEvidence: [1, 2], // 9 is out of range and dropped
      queries: ['sweden lottery 1859', 'swedish lighthouses'],
      webSearches: 2,
      trace: { stage: 'verify', model: 'claude-sonnet-5-5', promptVersion: 'test-v1' },
    });
    expect(f.searched).toEqual([
      'wiki:sweden lottery 1859',
      'web:sweden lottery 1859',
      'wiki:swedish lighthouses',
      'web:swedish lighthouses',
    ]);
    // The same URL from two queries is kept once; sources are interleaved.
    expect(v.evidence.map((e) => e.retrievedFrom)).toEqual(['wikipedia-search', 'web-search']);
    expect(f.requests.map((r) => r.model)).toEqual([
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
    ]);
    // Plausibility is rated without evidence.
    expect(f.requests[0]?.user).toBe(LIE.text);
    expect(f.requests[2]?.user).toContain('[1] Swedish lotteries');
    expect(stats).toMatchObject({ passed: 1, webSearches: 2, labels: { contradicted: 1 } });
  });

  it('shows the judge the article section that matches the lie, not just the introduction', async () => {
    const f = fakes([plausible(), queriesReply(['q']), judgeReply('supported')]);
    const { verified } = await run(f);
    const snippet = verified[0]?.evidence[0]?.snippet ?? '';
    expect(snippet).toContain('Lotteries in Sweden have a long history.');
    expect(snippet).toContain(
      '== Lighthouses ==\nIn 1859 a lottery raised money for a lighthouse.',
    );
    expect(snippet).not.toContain('Football pools');
  });

  it('falls back to the search introduction when the article cannot be read', async () => {
    const f = fakes([plausible(), queriesReply(['q']), judgeReply('no-evidence', [])], WIKI, WEB, {
      articleFails: true,
    });
    const { verified } = await run(f);
    expect(verified[0]?.evidence[0]?.snippet).toBe('Lotteries in Sweden.');
  });

  it('fails a lie the evidence supports: it is actually true', async () => {
    const { verified } = await run(
      fakes([plausible(5), queriesReply(['q']), judgeReply('supported')]),
    );
    expect(verified[0]).toMatchObject({ passed: false, label: 'supported' });
  });

  it('fails a no-evidence lie below the plausibility floor', async () => {
    const { verified, stats } = await run(
      fakes([plausible(2), queriesReply(['q']), judgeReply('no-evidence', [])]),
    );
    expect(verified[0]).toMatchObject({ passed: false, label: 'no-evidence', plausibility: 2 });
    expect(stats.lowPlausibility).toBe(1);
  });

  it('fails closed when plausibility could not be rated', async () => {
    const { verified } = await run(
      fakes([
        failed('refusal', 'claude-sonnet-5-5'),
        queriesReply(['q']),
        judgeReply('contradicted'),
      ]),
    );
    expect(verified[0]).toMatchObject({ passed: false, label: 'contradicted' });
    expect(verified[0]?.plausibility).toBeUndefined();
  });

  it('never judges, and never passes, a lie when no evidence was retrieved', async () => {
    const f = fakes([plausible(), queriesReply(['q'])], [], [], {
      wikiFails: true,
      webFails: true,
    });
    const { verified } = await run(f);
    expect(verified[0]).toMatchObject({ passed: false, error: 'no-retrieval', evidence: [] });
    expect(verified[0]?.label).toBeUndefined();
    expect(verified[0]?.searchErrors).toEqual([
      'wikipedia: wiki down',
      'web: Tavily search failed with HTTP 500',
    ]);
    expect(f.requests).toHaveLength(2); // no judge call
  });

  it('still judges on Wikipedia alone when web search fails, and records the error', async () => {
    const { verified } = await run(
      fakes([plausible(), queriesReply(['q']), judgeReply('no-evidence', [])], WIKI, [], {
        webFails: true,
      }),
    );
    expect(verified[0]).toMatchObject({
      passed: true,
      searchErrors: ['web: Tavily search failed with HTTP 500'],
    });
  });

  it('falls back to the statement as the query if the query model fails', async () => {
    const f = fakes([
      plausible(),
      failed('unparseable', 'claude-haiku-5-5'),
      judgeReply('contradicted'),
    ]);
    const { verified } = await run(f);
    expect(verified[0]?.queries).toEqual([LIE.text]);
  });

  it('fails closed when the judge refuses', async () => {
    const { verified, stats } = await run(
      fakes([plausible(), queriesReply(['q']), failed('refusal', 'claude-sonnet-5-5')]),
    );
    expect(verified[0]).toMatchObject({ passed: false, error: 'judge-refusal', plausibility: 4 });
    expect(stats.labels.unjudged).toBe(1);
  });

  it('stops starting new lies once the budget is spent', async () => {
    const f = fakes([plausible(), queriesReply(['q']), judgeReply('contradicted')]);
    const { verified, stats } = await run(f, [LIE, { ...LIE, id: 'l2' }], 0.02);
    expect(verified).toHaveLength(1);
    expect(stats.notStarted).toBe(1);
  });
});

describe('helpers', () => {
  const e = (url: string, from: Evidence['retrievedFrom'] = 'web-search'): Evidence => ({
    url,
    title: url,
    snippet: 's',
    retrievedFrom: from,
    query: 'q',
  });

  it('mergeEvidence interleaves groups, drops duplicate URLs and caps the total', () => {
    const merged = mergeEvidence(
      [
        [e('a'), e('b')],
        [e('a'), e('c'), e('d')],
      ],
      3,
    );
    expect(merged.map((x) => x.url)).toEqual(['a', 'b', 'c']);
  });

  it('formatEvidence numbers items from 1, or says there are none', () => {
    expect(formatEvidence([e('u1'), e('u2')])).toMatch(/^\[1\] u1 \(u1\)\ns\n\n\[2\] u2/);
    expect(formatEvidence([])).toBe('(no results)');
  });

  it('passes only unsupported lies with plausibility 3+', () => {
    expect(passes('contradicted', 3)).toBe(true);
    expect(passes('no-evidence', 5)).toBe(true);
    expect(passes('no-evidence', 2)).toBe(false);
    expect(passes('supported', 5)).toBe(false);
  });
});
