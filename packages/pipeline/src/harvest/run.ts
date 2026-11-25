import { createHash } from 'node:crypto';
import { CandidateSchema } from '../schemas';
import type { Candidate, HarvestInput, StageContext } from '../types';
import { buildContext } from './context';
import { dykArchiveTitle, type ParsedHook, parseDykArchive } from './dyk-parse';
import { isLivingPerson } from './living';
import { chunk, type WikiClient } from './wiki-client';

export type SkipReason = 'no-subject' | 'missing-article' | 'empty-context';

export interface HarvestStats {
  months: number;
  hooks: number;
  candidates: number;
  livingPerson: number;
  skipped: Record<SkipReason, number>;
}

export interface HarvestResult {
  candidates: Candidate[];
  stats: HarvestStats;
}

/** How many hooks to check for living people per round of Wikidata lookups. */
const LIVING_CHECK_BATCH = 25;

/** Stable id: re-harvesting the same hook gives the same id. */
export function candidateId(month: string, hookText: string): string {
  const hash = createHash('sha256').update(hookText).digest('hex').slice(0, 10);
  return `dyk-${month}-${hash}`;
}

/** Which of each hook's linked articles are living people, keyed by hook text. */
export async function livingPeopleByHook(
  client: WikiClient,
  hooks: ParsedHook[],
  now: Date,
): Promise<Map<string, string[]>> {
  const titles = hooks.flatMap((h) => h.links);
  const ids = await client.wikidataIds(titles);
  const entities = await client.entities([...ids.values()]);
  const living = new Set(entities.filter((e) => isLivingPerson(e, now)).map((e) => e.id));
  return new Map(
    hooks.map((h) => [
      h.text,
      h.links.filter((t) => {
        const id = ids.get(t);
        return id !== undefined && living.has(id);
      }),
    ]),
  );
}

/**
 * Stage 1 for DYK: read archive months, keep hooks with a subject article,
 * attach evidence text and revision ID, and flag living people.
 */
export async function harvestDyk(
  input: HarvestInput,
  ctx: StageContext,
  client: WikiClient,
): Promise<HarvestResult> {
  if (input.source !== 'dyk') {
    throw new Error(`Harvest source "${input.source}" is not implemented yet`);
  }
  const stats: HarvestStats = {
    months: 0,
    hooks: 0,
    candidates: 0,
    livingPerson: 0,
    skipped: { 'no-subject': 0, 'missing-article': 0, 'empty-context': 0 },
  };
  const candidates: Candidate[] = [];
  const trace = {
    stage: 'harvest' as const,
    promptVersion: ctx.promptVersion,
    createdAt: ctx.now.toISOString(),
  };

  for (const month of input.months) {
    if (candidates.length >= input.limit) break;
    const page = await client.archivePage(dykArchiveTitle(month));
    const hooks = parseDykArchive(page.wikitext);
    stats.months++;

    for (const group of chunk(hooks, LIVING_CHECK_BATCH)) {
      if (candidates.length >= input.limit) break;
      const living = await livingPeopleByHook(client, group, ctx.now);

      for (const hook of group) {
        if (candidates.length >= input.limit) break;
        stats.hooks++;
        const subject = hook.subjects[0];
        if (!subject) {
          stats.skipped['no-subject']++;
          continue;
        }
        const article = await client.article(subject);
        if (!article) {
          stats.skipped['missing-article']++;
          continue;
        }
        const contextText = buildContext(article.extract, hook.text);
        if (!contextText) {
          stats.skipped['empty-context']++;
          continue;
        }
        const livingPeople = living.get(hook.text) ?? [];
        if (livingPeople.length) stats.livingPerson++;
        candidates.push(
          CandidateSchema.parse({
            id: candidateId(month, hook.text),
            harvestedFrom: 'dyk',
            month,
            rawClaim: hook.text,
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
