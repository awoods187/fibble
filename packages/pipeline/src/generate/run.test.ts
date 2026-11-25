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
import type { RewordedTruth, StageContext } from '../types';
import type { VerifiedLie } from '../verify/schemas';
import { gate2Report, generateForPairs, lieId, pairTruths, type TruthPair } from './run';
import { GenerationRecordSchema, type GeneratedLie } from './schemas';

const CTX: StageContext = {
  promptVersion: 'none',
  dryRun: false,
  now: new Date('2026-11-25T12:00:00Z'),
};
const PROMPT = parsePrompt(
  'generate-lies',
  'test-v1',
  '# System\nWrite {{count}}.\n# User\n{{category}}|{{truth_1}}|{{truth_2}}|{{count}}',
);
const usage = (model: CallUsage['model'], usd: number): CallUsage => ({
  model,
  inputTokens: 10,
  outputTokens: 5,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  usd,
});

// Made-up content; no real Wikipedia text.
function truth(
  id: string,
  category: RewordedTruth['category'],
  text: string,
  entity: string,
): RewordedTruth {
  return {
    candidateId: id,
    category,
    text,
    expansion: 'x',
    source: { title: 'T', url: 'https://en.wikipedia.org/wiki/T', revisionId: 1 },
    supportingSentence: 'x',
    entities: [entity],
    scores: { surprise: 4, verifiability: 4 },
    entailment: { supported: true, unsupportedDetails: [] },
    usage: [usage('claude-opus-5-5', 0.01)],
    trace: { stage: 'reword', promptVersion: 'x', createdAt: '2026-11-25T00:00:00.000Z' },
  };
}
const T1 = truth(
  't1',
  'History',
  'The Glass Lighthouse of Vell relied on tallow candles for its light right up until the year 1931.',
  'Glass Lighthouse of Vell',
);
const T2 = truth(
  't2',
  'History',
  'In 1802 the harbour town of Quillmouth paid its fishermen in salted herring instead of coins.',
  'Quillmouth',
);
const T3 = truth(
  't3',
  'History',
  'In 1750 the village of Brindle elected a goose as honorary mayor for a single summer festival.',
  'Brindle',
);
const A1 = truth(
  'a1',
  'Arts & Entertainment',
  'A lost 1920s opera by the composer Ilse Varn was found in 2003 inside a bakery wall in Graz.',
  'Ilse Varn',
);

const LIE_A: GeneratedLie = {
  text: 'In 1874 a Danish ferry company issued brass tokens to passengers who agreed to help row in calm weather.',
  lieNote: 'Plausible because early ferries had odd crewing rules; this one is invented.',
  borrowedTexture: 'ferry quirks',
};
const LIE_B: GeneratedLie = {
  text: 'In 1868 the town of Ostervik required every bakery to ring a small bell when fresh rye loaves came out.',
  lieNote: 'Plausible because towns regulated bakers closely; this rule is invented.',
  borrowedTexture: 'bakery regulation',
};
const LIE_DUP: GeneratedLie = {
  ...LIE_A,
  text: 'In 1874 a Danish ferry company gave brass tokens to passengers who agreed to help row in calm weather.',
};
const LIE_BAD: GeneratedLie = {
  ...LIE_B,
  text: 'The Glass Lighthouse of Vell once burned whale oil for 3 weeks during a long winter storm at sea.',
};

function fakeLlm(replies: StructuredResult<unknown>[]) {
  const requests: StructuredRequest<z.ZodType>[] = [];
  const llm: LlmClient = {
    structured: async (req) => {
      requests.push(req);
      const r = replies.shift();
      if (!r) throw new Error('unexpected LLM call');
      return r as never;
    },
  };
  return { llm, requests };
}
const ok = (lies: GeneratedLie[]): StructuredResult<unknown> => ({
  ok: true,
  output: { lies },
  usage: usage('claude-opus-5-5', 0.05),
});

describe('pairTruths', () => {
  it('pairs truths within a category in order, leaving an odd one out', () => {
    const pairs = pairTruths([T1, A1, T2, T3]);
    expect(pairs.map((p) => p.map((t) => t.candidateId))).toEqual([['t1', 't2']]);
  });
});

describe('generateForPairs', () => {
  it('asks Opus for the lies and keeps those that pass the checks', async () => {
    const { llm, requests } = fakeLlm([ok([LIE_A, LIE_DUP, LIE_B, LIE_BAD])]);
    const { records } = await generateForPairs([[T1, T2]], CTX, {
      llm,
      prompt: PROMPT,
      budget: new Budget(5),
    });
    const r = GenerationRecordSchema.parse(records[0]);
    expect(r).toMatchObject({
      category: 'History',
      truthIds: ['t1', 't2'],
      requested: 5,
      returned: 4,
    });
    expect(r.accepted.map((l) => l.text)).toEqual([LIE_A.text, LIE_B.text]);
    expect(r.accepted[0]).toMatchObject({
      id: lieId(['t1', 't2'], LIE_A.text),
      basedOnTruthIds: ['t1', 't2'],
      trace: { stage: 'generateLies', model: 'claude-opus-5-5', promptVersion: 'test-v1' },
    });
    expect(r.rejected.map((x) => x.reasons)).toEqual([
      ['duplicate'],
      ['same-topic', 'copied-truth'],
    ]);
    expect(requests[0]).toMatchObject({
      model: 'claude-opus-5-5',
      effort: 'high',
      system: 'Write 5.',
    });
    expect(requests[0]?.user).toBe(`History|${T1.text}|${T2.text}|5`);
  });

  it('records a failed generator call without lies', async () => {
    const { llm } = fakeLlm([
      { ok: false, reason: 'refusal', usage: usage('claude-opus-5-5', 0.01) },
    ]);
    const { records } = await generateForPairs([[T1, T2]], CTX, {
      llm,
      prompt: PROMPT,
      budget: new Budget(5),
    });
    expect(records[0]).toMatchObject({ returned: 0, accepted: [], error: 'refusal' });
  });

  it('stops starting new pairs once the budget is spent', async () => {
    const { llm } = fakeLlm([ok([LIE_A])]);
    const { records, notStarted } = await generateForPairs(
      [
        [T1, T2],
        [T2, T3],
      ],
      CTX,
      {
        llm,
        prompt: PROMPT,
        budget: new Budget(0.05),
      },
    );
    expect(records).toHaveLength(1);
    expect(notStarted).toBe(1);
  });

  it('gives a lie the same id on every run', () => {
    expect(lieId(['a', 'b'], 'x')).toBe(lieId(['a', 'b'], 'x'));
    expect(lieId(['a', 'b'], 'x')).not.toBe(lieId(['a', 'c'], 'x'));
  });
});

describe('gate2Report', () => {
  it('counts usable rounds, supported "lies" and cost per round', async () => {
    const { llm } = fakeLlm([ok([LIE_A, LIE_B]), ok([LIE_BAD])]);
    const pairs: TruthPair[] = [
      [T1, T2],
      [T2, T3],
    ];
    const { records } = await generateForPairs(pairs, CTX, {
      llm,
      prompt: PROMPT,
      budget: new Budget(5),
    });
    const v = (
      id: string,
      passed: boolean,
      label: VerifiedLie['label'],
      plausibility: number,
    ): VerifiedLie => ({
      lie: { id, category: 'History', text: id },
      queries: [],
      evidence: [],
      label,
      plausibility,
      judgeRationale: '',
      citedEvidence: [],
      passed,
      searchErrors: [],
      usage: [usage('claude-sonnet-5-5', 0.02)],
      webSearches: 1,
      trace: { stage: 'verify', promptVersion: 'x', createdAt: '2026-11-25T00:00:00.000Z' },
    });
    const [a, b] = records[0]?.accepted ?? [];
    const report = gate2Report(pairs, records, [
      v(a?.id ?? '', true, 'no-evidence', 4),
      v(b?.id ?? '', false, 'supported', 5),
    ]);
    expect(report).toMatchObject({
      rounds: 2,
      roundsWithPassingLie: 1,
      liesGenerated: 3,
      liesPassedChecks: 3, // round 2's lie is off-topic for that pair, so it passes
      liesPassedVerification: 1,
      liesSupported: 1,
      plausibility: { '4': 1, '5': 1 },
    });
    // Round 1: generation 0.05 + two verifications 0.04 + two truths 0.02. Round 2: 0.05 + 0.02.
    expect(report.roundsDetail[0]?.costUsd).toBeCloseTo(0.11, 10);
    expect(report.costPerRoundUsd).toBeCloseTo((0.11 + 0.07) / 2, 10);
  });
});
