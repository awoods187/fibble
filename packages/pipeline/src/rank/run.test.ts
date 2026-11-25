import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  Budget,
  type CallUsage,
  type LlmClient,
  type StructuredRequest,
  type StructuredResult,
} from '../llm';
import { parsePrompt } from '../prompts';
import { RewordedTruthSchema } from '../reword/schemas';
import type { RewordedTruth, StageContext } from '../types';
import { atLeast, maxGreat, rankTruths } from './run';

const CTX: StageContext = {
  promptVersion: 'none',
  dryRun: false,
  now: new Date('2026-11-25T12:00:00Z'),
};
const PROMPT = parsePrompt(
  'rank-fun',
  'test-v1',
  '# System\nMax {{max_great}} great.\n# User\n{{statements}}',
);
const usage: CallUsage = {
  model: 'claude-opus-5-5',
  inputTokens: 1,
  outputTokens: 1,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  usd: 0.03,
};

// Made-up truths; only the ids and text matter here.
const truth = (i: number): RewordedTruth => ({
  candidateId: `t${i}`,
  category: 'History',
  text: `Statement number ${i} about something rather odd that happened in a small coastal town long ago.`,
  expansion: 'x',
  source: { title: 'T', url: 'https://en.wikipedia.org/wiki/T', revisionId: 1 },
  supportingSentence: 'x',
  entities: [],
  scores: { surprise: 4, verifiability: 4 },
  entailment: { supported: true, unsupportedDetails: [] },
  usage: [],
  trace: { stage: 'reword', promptVersion: 'x', createdAt: '2026-11-25T00:00:00.000Z' },
});

type Tier = 'great' | 'fine' | 'boring';
/** Answers each batch by reading the statement numbers from the prompt. */
function fakeLlm(tierFor: (text: string) => Tier, fail = false) {
  const requests: StructuredRequest<z.ZodType>[] = [];
  const llm: LlmClient = {
    structured: async (req) => {
      requests.push(req);
      if (fail) return { ok: false, reason: 'refusal', usage } as StructuredResult<never>;
      const lines = req.user.split('\n');
      const items = lines.map((line, i) => ({
        n: i + 1,
        tier: tierFor(line),
        reason: ' because ',
      }));
      return { ok: true, output: { items }, usage } as never;
    },
  };
  return { llm, requests };
}

const TRUTHS = Array.from({ length: 12 }, (_, i) => truth(i + 1));

describe('rankTruths', () => {
  it('ranks in shuffled batches, with the great cap in the prompt', async () => {
    const { llm, requests } = fakeLlm(() => 'fine');
    const { truths, stats } = await rankTruths(TRUTHS, CTX, {
      llm,
      prompt: PROMPT,
      budget: new Budget(5),
      batchSize: 5,
      seed: 's',
    });
    expect(requests).toHaveLength(3);
    expect(requests[0]?.system).toBe(`Max ${maxGreat(5)} great.`);
    expect(requests[0]?.model).toBe('claude-opus-5-5');
    expect(requests[0]?.user).toMatch(/^1\. \[History\] Statement number \d+/);
    expect(stats).toMatchObject({
      truths: 12,
      ranked: 12,
      unranked: 0,
      tiers: { great: 0, fine: 12, boring: 0 },
    });
    // Order is preserved, and every record still validates.
    expect(truths.map((t) => t.candidateId)).toEqual(TRUTHS.map((t) => t.candidateId));
    for (const t of truths) expect(RewordedTruthSchema.safeParse(t).success).toBe(true);
    expect(truths[0]?.fun).toEqual({ tier: 'fine', reason: 'because', promptVersion: 'test-v1' });
  });

  it('enforces the great cap even if the model ignores it', async () => {
    const { llm } = fakeLlm(() => 'great');
    const { stats } = await rankTruths(TRUTHS.slice(0, 10), CTX, {
      llm,
      prompt: PROMPT,
      budget: new Budget(5),
      batchSize: 10,
    });
    expect(stats.tiers).toEqual({ great: maxGreat(10), fine: 10 - maxGreat(10), boring: 0 });
    expect(maxGreat(10)).toBe(3);
    expect(maxGreat(2)).toBe(1);
  });

  it('leaves truths unranked when a call fails or the budget runs out', async () => {
    const failed = await rankTruths(TRUTHS, CTX, {
      llm: fakeLlm(() => 'fine', true).llm,
      prompt: PROMPT,
      budget: new Budget(5),
    });
    expect(failed.stats).toMatchObject({ ranked: 0, unranked: 12 });
    expect(failed.truths[0]?.fun).toBeUndefined();

    const capped = await rankTruths(TRUTHS, CTX, {
      llm: fakeLlm(() => 'fine').llm,
      prompt: PROMPT,
      budget: new Budget(0.03),
      batchSize: 5,
    });
    expect(capped.stats).toMatchObject({ ranked: 5, unranked: 7 });
  });
});

describe('atLeast', () => {
  const ranked = [
    { ...truth(1), fun: { tier: 'great' as const, reason: '', promptVersion: 'v' } },
    { ...truth(2), fun: { tier: 'fine' as const, reason: '', promptVersion: 'v' } },
    { ...truth(3), fun: { tier: 'boring' as const, reason: '', promptVersion: 'v' } },
    truth(4),
  ];
  it('keeps truths at or above a tier, and drops unranked ones', () => {
    expect(atLeast(ranked, 'great').map((t) => t.candidateId)).toEqual(['t1']);
    expect(atLeast(ranked, 'fine').map((t) => t.candidateId)).toEqual(['t1', 't2']);
  });
});
