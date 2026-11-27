import { createHash } from 'node:crypto';
import type { Category } from '@fibble/shared';
import { findSensitive } from '../content/sensitive';
import { CandidateSchema } from '../schemas';
import { seededShuffle } from '../shuffle';
import type { Candidate, StageContext } from '../types';
import { buildContext } from './context';
import { normalizeTitle, type ParsedHook, wikitextToPlain } from './dyk-parse';
import { type HarvestStats, livingPeopleByHook } from './run';
import { chunk, type WikiClient } from './wiki-client';

/**
 * Second harvest source: Wikipedia:Unusual articles (PRD section 5, stage 1). Its topic
 * subpages map onto Fibble's categories, which is what DYK (mostly History) can't give us.
 * Each entry is an article plus a one-line, often joking, blurb: a topic seed, not a claim.
 * Stage 2 finds the claim in the article's text.
 */

/** Topic subpages used, and the category each suggests. */
export const UNUSUAL_TOPICS: Record<string, Category> = {
  History: 'History',
  Science: 'Science & Nature',
  'Mathematics and numbers': 'Science & Nature',
  'Technology, inventions and products': 'Science & Nature',
  'Places and infrastructure': 'Geography & Places',
  Sports: 'Sports & Games',
  'Popular culture, entertainment and the arts': 'Arts & Entertainment',
};

/**
 * Split a --topics value on commas, keeping topic names that contain a comma whole
 * ("Technology, inventions and products"). Unknown names pass through for the caller to reject.
 */
export function parseTopics(value: string): string[] {
  const names = Object.keys(UNUSUAL_TOPICS);
  const startsName = (prefix: string) => names.some((n) => n.startsWith(`${prefix},`));
  const out: string[] = [];
  let pending = '';
  const take = (piece: string) => {
    if (names.includes(piece) || !startsName(piece)) out.push(piece);
    else pending = piece;
  };
  for (const piece of value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    if (!pending) {
      take(piece);
      continue;
    }
    const joined = `${pending}, ${piece}`;
    pending = '';
    if (names.includes(joined)) out.push(joined);
    else if (startsName(joined)) pending = joined;
    else {
      out.push(joined.slice(0, joined.length - piece.length - 2)); // the unfinished name, as typed
      take(piece);
    }
  }
  if (pending) out.push(pending);
  return out;
}

/**
 * Subpages never harvested: their topics are banned or sensitive (ADR 0010), or they
 * aren't article lists. Recorded so the choice is deliberate.
 */
export const EXCLUDED_UNUSUAL_TOPICS = [
  'Death',
  'Military',
  'Phobias',
  'Religion and spirituality',
  'Society, economy and law',
  'Categories',
  'Lists',
  'Other pages',
  'Questions',
  'Removed',
] as const;

export const unusualPageTitle = (topic: string) => `Wikipedia:Unusual articles/${topic}`;

export interface UnusualEntry {
  /** The article, from the row's bold link. */
  title: string;
  /** The row's blurb, as plain text. */
  blurb: string;
  /** Article links in the row (title included), for the living-person check. */
  links: string[];
}

const BOLD_LINK = /'''+\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/;
const LINK = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
const NON_ARTICLE =
  /^:?\s*(?:file|image|media|category|template|help|portal|special|wikipedia)\s*:/i;

/** Rows of the subpage's wikitable: `| '''[[Article]]''' \n | blurb`. */
export function parseUnusualTable(wikitext: string): UnusualEntry[] {
  const entries: UnusualEntry[] = [];
  const seen = new Set<string>();
  for (const row of wikitext.split(/\n\|-[^\n]*/)) {
    const cells = row
      .split('\n')
      .filter((l) => l.startsWith('|') && !l.startsWith('|}') && !l.startsWith('|+'))
      .map((l) => l.replace(/^\|\s*(?:[a-z-]+="[^"]*"\s*\|)?/i, '').trim());
    if (cells.length < 2) continue;
    const bold = BOLD_LINK.exec(cells[0] ?? '');
    if (!bold?.[1] || NON_ARTICLE.test(bold[1])) continue;
    const title = normalizeTitle(bold[1]);
    if (!title || seen.has(title)) continue;
    seen.add(title);
    const blurb = wikitextToPlain(cells.slice(1).join(' '));
    const links = [title];
    for (const m of (cells[1] ?? '').matchAll(LINK)) {
      const t = m[1];
      if (!t || NON_ARTICLE.test(t)) continue;
      const n = normalizeTitle(t);
      if (n && !links.includes(n)) links.push(n);
    }
    entries.push({ title, blurb, links });
  }
  return entries;
}

export function unusualCandidateId(topic: string, title: string): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/^-|-$/g, '');
  return `ua-${slug}-${createHash('sha256').update(title).digest('hex').slice(0, 10)}`;
}

export interface UnusualInput {
  topics: string[];
  /** Candidates per topic. */
  limit: number;
  /** Seed for which entries are sampled from each topic. */
  seed: string;
  /** Articles to skip (already harvested or already in the bank). */
  skipTitles?: Set<string>;
}

/** Harvest candidates from Unusual articles topics, `limit` per topic, sampled by seed. */
export async function harvestUnusual(
  input: UnusualInput,
  ctx: StageContext,
  client: WikiClient,
): Promise<{ candidates: Candidate[]; stats: HarvestStats & { sensitive: number } }> {
  const stats = {
    months: 0,
    hooks: 0,
    candidates: 0,
    livingPerson: 0,
    sensitive: 0,
    skipped: { 'no-subject': 0, 'missing-article': 0, 'empty-context': 0 },
  };
  const candidates: Candidate[] = [];
  const trace = {
    stage: 'harvest' as const,
    promptVersion: ctx.promptVersion,
    createdAt: ctx.now.toISOString(),
  };

  for (const topic of input.topics) {
    const categoryHint = UNUSUAL_TOPICS[topic];
    if (!categoryHint) throw new Error(`Unknown or excluded Unusual articles topic: "${topic}"`);
    const page = await client.archivePage(unusualPageTitle(topic));
    const entries = seededShuffle(
      parseUnusualTable(page.wikitext),
      `${input.seed}:${topic}`,
    ).filter((e) => !input.skipTitles?.has(e.title));
    let taken = 0;
    for (const group of chunk(entries, 25)) {
      if (taken >= input.limit) break;
      const hooks: ParsedHook[] = group.map((e) => ({
        text: `${e.title}: ${e.blurb}`,
        subjects: [e.title],
        links: e.links,
      }));
      const living = await livingPeopleByHook(client, hooks, ctx.now);
      for (const [i, entry] of group.entries()) {
        if (taken >= input.limit) break;
        stats.hooks++;
        const rawClaim = hooks[i]?.text ?? entry.title;
        if (findSensitive(rawClaim).length) {
          stats.sensitive++;
          continue;
        }
        const article = await client.article(entry.title);
        if (!article) {
          stats.skipped['missing-article']++;
          continue;
        }
        const contextText = buildContext(article.extract, entry.blurb || entry.title);
        if (!contextText) {
          stats.skipped['empty-context']++;
          continue;
        }
        const livingPeople = living.get(rawClaim) ?? [];
        if (livingPeople.length) stats.livingPerson++;
        taken++;
        candidates.push(
          CandidateSchema.parse({
            id: unusualCandidateId(topic, article.title),
            harvestedFrom: 'unusual-articles',
            topic,
            categoryHint,
            rawClaim,
            article: { title: article.title, url: article.url, revisionId: article.revisionId },
            contextText,
            involvesLivingPerson: livingPeople.length > 0,
            livingPeople,
            trace,
          }),
        );
      }
    }
  }
  stats.candidates = candidates.length;
  return { candidates, stats };
}
