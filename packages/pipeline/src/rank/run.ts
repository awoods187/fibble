import { z } from 'zod';
import type { Budget, CallUsage, LlmClient } from '../llm';
import { MODELS } from '../models';
import { type Prompt, render } from '../prompts';
import { seededShuffle } from '../rating/page';
import type { RewordedTruth, StageContext } from '../types';

/**
 * Fun ranking (ADR 0009). Stage 2 scored surprise one truth at a time and gave
 * every accepted truth a 4, so the score separated nothing. Comparing truths
 * against each other, with a cap on "great", forces the model to discriminate.
 */

export const FUN_TIERS = ['great', 'fine', 'boring'] as const;
export type FunTier = (typeof FUN_TIERS)[number];

/** What the ranking model returns (prompts/example-v1/rank-fun.md). */
export const FunRankingSchema = z.object({
  items: z.array(z.object({ n: z.int(), tier: z.enum(FUN_TIERS), reason: z.string() })),
});

export const RANK_BATCH_SIZE = 10;
/** At most this share of a batch may be "great". */
export const MAX_GREAT_SHARE = 1 / 3;
export const RANK_MAX_TOKENS = 16_000;

export interface RankOptions {
  llm: LlmClient;
  prompt: Prompt;
  budget: Budget;
  batchSize?: number;
  /** Seed for the shuffle that mixes truths into batches. */
  seed?: string;
}

export interface RankStats {
  truths: number;
  ranked: number;
  /** Truths the model skipped or the budget didn't reach. */
  unranked: number;
  tiers: Record<FunTier, number>;
  spentUsd: number;
}

export const maxGreat = (batch: number) => Math.max(1, Math.floor(batch * MAX_GREAT_SHARE));

/**
 * Rank truths in shuffled batches. Returns every truth, with `fun` set on those
 * the model ranked. If a batch has more "great" than allowed, the extras become
 * "fine" in the order the model listed them, so the cap holds even if the model ignores it.
 */
export async function rankTruths(
  truths: RewordedTruth[],
  ctx: StageContext,
  opts: RankOptions,
): Promise<{ truths: RewordedTruth[]; usage: CallUsage[]; stats: RankStats }> {
  const size = opts.batchSize ?? RANK_BATCH_SIZE;
  const shuffled = seededShuffle(truths, opts.seed ?? ctx.now.toISOString().slice(0, 10));
  const fun = new Map<string, NonNullable<RewordedTruth['fun']>>();
  const usage: CallUsage[] = [];

  for (let start = 0; start < shuffled.length; start += size) {
    if (opts.budget.exhausted) break;
    const batch = shuffled.slice(start, start + size);
    const cap = maxGreat(batch.length);
    const call = await opts.llm.structured({
      model: MODELS.rankFun,
      system: render(opts.prompt.system, { max_great: String(cap) }),
      user: render(opts.prompt.user, {
        statements: batch.map((t, i) => `${i + 1}. [${t.category}] ${t.text}`).join('\n'),
      }),
      schema: FunRankingSchema,
      maxTokens: RANK_MAX_TOKENS,
      effort: 'medium',
    });
    usage.push(call.usage);
    opts.budget.add(call.usage);
    if (!call.ok) continue;

    let greats = 0;
    const seen = new Set<number>();
    for (const item of call.output.items) {
      const truth = batch[item.n - 1];
      if (!truth || seen.has(item.n)) continue;
      seen.add(item.n);
      let tier = item.tier;
      if (tier === 'great' && ++greats > cap) tier = 'fine';
      fun.set(truth.candidateId, {
        tier,
        reason: item.reason.trim(),
        promptVersion: opts.prompt.version,
      });
    }
  }

  const out = truths.map((t) => {
    const f = fun.get(t.candidateId);
    return f ? { ...t, fun: f } : t;
  });
  const tiers: Record<FunTier, number> = { great: 0, fine: 0, boring: 0 };
  for (const f of fun.values()) tiers[f.tier]++;
  return {
    truths: out,
    usage,
    stats: {
      truths: truths.length,
      ranked: fun.size,
      unranked: truths.length - fun.size,
      tiers,
      spentUsd: opts.budget.spentUsd,
    },
  };
}

/** Truths at or above a tier: "great" keeps only great; "fine" keeps great and fine. */
export function atLeast(truths: RewordedTruth[], tier: FunTier): RewordedTruth[] {
  const rank = (t: FunTier) => FUN_TIERS.indexOf(t);
  return truths.filter((t) => t.fun && rank(t.fun.tier) <= rank(tier));
}
