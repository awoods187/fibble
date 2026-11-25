import { evidencePassage } from '../harvest/context';
import type { SearchHit, WikiClient } from '../harvest/wiki-client';
import type { Budget, CallUsage, Effort, LlmClient } from '../llm';
import { MODELS } from '../models';
import { type Prompt, render } from '../prompts';
import type { StageContext, Trace } from '../types';
import {
  type Evidence,
  JudgeSchema,
  type LieInput,
  MIN_PLAUSIBILITY,
  PlausibilitySchema,
  SearchQueriesSchema,
  type VerificationLabel,
  type VerifiedLie,
  VerifiedLieSchema,
} from './schemas';
import type { TavilyClient } from './tavily';

export interface VerifyPrompts {
  queries: Prompt;
  judge: Prompt;
  plausibility: Prompt;
}

export interface VerifyOptions {
  llm: LlmClient;
  prompts: VerifyPrompts;
  wiki: WikiClient;
  tavily: TavilyClient;
  budget: Budget;
  /** Results kept per query from each source. */
  perQuery?: number;
  /** Most evidence items shown to the judge (PRD: 5 to 10). */
  maxEvidence?: number;
  judgeEffort?: Effort;
}

export interface VerifyStats {
  lies: number;
  notStarted: number;
  passed: number;
  labels: Record<VerificationLabel | 'unjudged', number>;
  lowPlausibility: number;
  webSearches: number;
  spentUsd: number;
}

export const MAX_QUERIES = 3;
export const SNIPPET_CHARS = 1200;
export const QUERIES_MAX_TOKENS = 4_000;
export const PLAUSIBILITY_MAX_TOKENS = 4_000;
export const JUDGE_MAX_TOKENS = 16_000;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()} …` : s);

/** Numbered evidence as the judge sees it. Numbers are 1-based and match `citedEvidence`. */
export function formatEvidence(evidence: Evidence[]): string {
  if (!evidence.length) return '(no results)';
  return evidence.map((e, i) => `[${i + 1}] ${e.title} (${e.url})\n${e.snippet}`).join('\n\n');
}

/** Keep the first hit per URL, interleaving sources so neither crowds the other out. */
export function mergeEvidence(groups: Evidence[][], max: number): Evidence[] {
  const out: Evidence[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...groups.map((g) => g.length));
  for (let i = 0; i < longest && out.length < max; i++) {
    for (const g of groups) {
      const e = g[i];
      if (!e || seen.has(e.url)) continue;
      seen.add(e.url);
      out.push(e);
      if (out.length >= max) break;
    }
  }
  return out;
}

/** The PRD's pass rule: not supported by evidence, and believable. */
export function passes(label: VerificationLabel, plausibility: number): boolean {
  return label !== 'supported' && plausibility >= MIN_PLAUSIBILITY;
}

/**
 * Wikipedia evidence for one hit: the article's lead plus the section that best
 * matches the statement. Search only returns introductions, and DYK-style facts
 * often sit deep in the body (golden-v1 found 3 false lies this way). Falls back
 * to the introduction if the full article can't be read.
 */
async function wikiPassage(
  hit: SearchHit,
  statement: string,
  opts: VerifyOptions,
): Promise<string> {
  const article = await opts.wiki.article(hit.title).catch(() => undefined);
  const passage = article ? evidencePassage(article.extract, statement) : '';
  return passage || clip(hit.extract, SNIPPET_CHARS);
}

async function retrieve(
  query: string,
  statement: string,
  opts: VerifyOptions,
  errors: string[],
): Promise<{ wiki: Evidence[]; web: Evidence[] }> {
  const perQuery = opts.perQuery ?? 3;
  const hits = await opts.wiki.searchArticles(query, perQuery).catch((e: unknown) => {
    errors.push(`wikipedia: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  });
  const wiki: Evidence[] = [];
  for (const h of hits) {
    wiki.push({
      url: h.url,
      title: h.title,
      snippet: await wikiPassage(h, statement, opts),
      retrievedFrom: 'wikipedia-search',
      query,
    });
  }
  const web = await opts.tavily.search(query, perQuery).then(
    (hits) =>
      hits.map((h): Evidence => ({
        url: h.url,
        title: h.title,
        snippet: clip(h.content, SNIPPET_CHARS),
        retrievedFrom: 'web-search',
        query,
      })),
    (e: unknown) => {
      errors.push(`web: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    },
  );
  return { wiki, web };
}

/**
 * Stage 4: for each lie, rate plausibility from the statement alone (Sonnet),
 * write queries (Haiku), retrieve evidence (Wikipedia and Tavily), and judge it
 * (Sonnet, a different model from the Opus generator).
 * A lie passes only if it was judged on real evidence as contradicted or
 * no-evidence, with plausibility 3+. Anything that goes wrong fails closed.
 */
export async function verifyLies(
  lies: LieInput[],
  ctx: StageContext,
  opts: VerifyOptions,
): Promise<{ verified: VerifiedLie[]; stats: VerifyStats }> {
  const verified: VerifiedLie[] = [];
  const stats: VerifyStats = {
    lies: lies.length,
    notStarted: 0,
    passed: 0,
    labels: { supported: 0, contradicted: 0, 'no-evidence': 0, unjudged: 0 },
    lowPlausibility: 0,
    webSearches: 0,
    spentUsd: 0,
  };
  const trace: Trace = {
    stage: 'verify',
    promptVersion: opts.prompts.judge.version,
    model: MODELS.verifyJudge,
    createdAt: ctx.now.toISOString(),
  };

  for (const [i, lie] of lies.entries()) {
    if (opts.budget.exhausted) {
      stats.notStarted = lies.length - i;
      break;
    }
    const usage: CallUsage[] = [];
    const searchErrors: string[] = [];
    const searchesBefore = opts.tavily.stats.searches;
    const record = (fields: Partial<VerifiedLie>) => {
      const v = VerifiedLieSchema.parse({
        lie,
        queries: [],
        evidence: [],
        judgeRationale: '',
        citedEvidence: [],
        passed: false,
        searchErrors,
        usage,
        webSearches: opts.tavily.stats.searches - searchesBefore,
        trace,
        ...fields,
      });
      verified.push(v);
      stats.labels[v.label ?? 'unjudged']++;
      if (v.passed) stats.passed++;
      stats.webSearches += v.webSearches;
    };

    // Plausibility first, from the statement alone: evidence would bias it.
    const p = await opts.llm.structured({
      model: MODELS.plausibility,
      system: opts.prompts.plausibility.system,
      user: render(opts.prompts.plausibility.user, { statement: lie.text }),
      schema: PlausibilitySchema,
      maxTokens: PLAUSIBILITY_MAX_TOKENS,
      effort: 'low',
    });
    usage.push(p.usage);
    opts.budget.add(p.usage);
    const plausibility = p.ok
      ? Math.min(5, Math.max(1, Math.round(p.output.plausibility)))
      : undefined;
    const plausibilityReason = p.ok ? p.output.reason.trim() : undefined;
    if (plausibility !== undefined && plausibility < MIN_PLAUSIBILITY) stats.lowPlausibility++;

    const q = await opts.llm.structured({
      model: MODELS.verifyQueries,
      system: opts.prompts.queries.system,
      user: render(opts.prompts.queries.user, { statement: lie.text }),
      schema: SearchQueriesSchema,
      maxTokens: QUERIES_MAX_TOKENS,
      effort: 'low',
    });
    usage.push(q.usage);
    opts.budget.add(q.usage);
    // Fall back to the statement itself if the query model fails: retrieval still runs.
    const queries = q.ok
      ? q.output.queries
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, MAX_QUERIES)
      : [];
    if (!queries.length) queries.push(lie.text);

    const wikiGroups: Evidence[][] = [];
    const webGroups: Evidence[][] = [];
    for (const query of queries) {
      const { wiki, web } = await retrieve(query, lie.text, opts, searchErrors);
      wikiGroups.push(wiki);
      webGroups.push(web);
    }
    const evidence = mergeEvidence([...wikiGroups, ...webGroups], opts.maxEvidence ?? 10);

    // "No evidence" from a failed search proves nothing, so never judge without any.
    if (!evidence.length) {
      record({ queries, plausibility, plausibilityReason, error: 'no-retrieval' });
      continue;
    }

    const judge = await opts.llm.structured({
      model: MODELS.verifyJudge,
      system: opts.prompts.judge.system,
      user: render(opts.prompts.judge.user, {
        statement: lie.text,
        evidence: formatEvidence(evidence),
      }),
      schema: JudgeSchema,
      maxTokens: JUDGE_MAX_TOKENS,
      effort: opts.judgeEffort ?? 'high',
    });
    usage.push(judge.usage);
    opts.budget.add(judge.usage);
    if (!judge.ok) {
      record({
        queries,
        evidence,
        plausibility,
        plausibilityReason,
        error: `judge-${judge.reason}`,
      });
      continue;
    }
    const { label, rationale, citedEvidence } = judge.output;
    record({
      queries,
      evidence,
      label,
      plausibility,
      plausibilityReason,
      judgeRationale: rationale.trim(),
      citedEvidence: citedEvidence.filter((n) => n >= 1 && n <= evidence.length),
      // No plausibility rating (the call failed) means no pass: fail closed.
      passed: plausibility !== undefined && passes(label, plausibility),
    });
  }

  stats.spentUsd = opts.budget.spentUsd;
  return { verified, stats };
}
