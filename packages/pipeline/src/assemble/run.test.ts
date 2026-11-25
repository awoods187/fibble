import { RoundSchema } from '@fibble/shared';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { GenerationRecord, LieCandidate } from '../generate/schemas';
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
import { heuristicFlags } from './heuristics';
import {
  assembleRounds,
  balancedPositions,
  difficultyFor,
  placeLie,
  rankLies,
  runSpotter,
} from './run';
import { CandidateRoundSchema, type LieScore } from './schemas';

const CTX: StageContext = {
  promptVersion: 'none',
  dryRun: false,
  now: new Date('2026-11-25T12:00:00Z'),
};
const PROMPT = parsePrompt(
  'style-spotter',
  'test-v1',
  '# System\nSpot.\n# User\n{{category}}\n{{statements}}',
);
const usage: CallUsage = {
  model: 'claude-haiku-5-5',
  inputTokens: 1,
  outputTokens: 1,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  usd: 0.0003,
};

// Made-up content; no real Wikipedia text.
const truth = (id: string, text: string): RewordedTruth => ({
  candidateId: id,
  category: 'History',
  text,
  expansion: `More about ${id}.`,
  source: { title: id, url: `https://en.wikipedia.org/wiki/${id}`, revisionId: 1 },
  supportingSentence: 'x',
  entities: [],
  scores: { surprise: 4, verifiability: 4 },
  entailment: { supported: true, unsupportedDetails: [] },
  usage: [],
  trace: { stage: 'reword', promptVersion: 'x', createdAt: '2026-11-25T00:00:00.000Z' },
});
const T1 = truth(
  't1',
  'The Glass Lighthouse of Vell relied on tallow candles for its light right up until the year 1931.',
);
const T2 = truth(
  't2',
  'In 1802 the harbour town of Quillmouth paid its fishermen in salted herring instead of coins.',
);
const lie = (id: string, text: string): LieCandidate => ({
  id,
  category: 'History',
  text,
  lieNote: `Why ${id} sounded true; it is invented.`,
  borrowedTexture: 'x',
  basedOnTruthIds: ['t1', 't2'],
  trace: { stage: 'generateLies', promptVersion: 'x', createdAt: '2026-11-25T00:00:00.000Z' },
});
const SUBTLE = lie(
  'subtle',
  'In 1874 a Danish ferry company issued brass tokens to passengers who agreed to help row.',
);
const OBVIOUS = lie(
  'obvious',
  'In 1874 a Danish ferry was rowed entirely by trained seals wearing tiny brass helmets!',
);
const verdict = (id: string, passed: boolean, plausibility = 4): VerifiedLie => ({
  lie: { id, category: 'History', text: id },
  queries: [],
  evidence: [],
  label: passed ? 'no-evidence' : 'supported',
  plausibility,
  judgeRationale: '',
  citedEvidence: [],
  passed,
  searchErrors: [],
  usage: [],
  webSearches: 0,
  trace: { stage: 'verify', promptVersion: 'x', createdAt: '2026-11-25T00:00:00.000Z' },
});
const record = (accepted: LieCandidate[]): GenerationRecord => ({
  category: 'History',
  truthIds: ['t1', 't2'],
  requested: 5,
  returned: accepted.length,
  accepted,
  rejected: [],
  usage: [],
  trace: { stage: 'generateLies', promptVersion: 'x', createdAt: '2026-11-25T00:00:00.000Z' },
});

/** A spotter that picks the card containing `findsIfContains`, else always a truth card. */
function fakeSpotter(findsIfContains: string, opts: { fail?: boolean } = {}) {
  const requests: StructuredRequest<z.ZodType>[] = [];
  const llm: LlmClient = {
    structured: async (req) => {
      requests.push(req);
      if (opts.fail) return { ok: false, reason: 'unparseable', usage } as StructuredResult<never>;
      const lines = req.user.split('\n').slice(1);
      const n = lines.findIndex((l) => l.includes(findsIfContains));
      const fallback = lines.findIndex((l) => l.includes('Quillmouth'));
      return {
        ok: true,
        output: { pick: (n >= 0 ? n : fallback) + 1, reason: 'r' },
        usage,
      } as never;
    },
  };
  return { llm, requests };
}

describe('runSpotter', () => {
  const statements: [string, string, string] = [T1.text, OBVIOUS.text, T2.text];

  it('counts how often the spotter finds the lie, shuffling the order every sample', async () => {
    const { llm, requests } = fakeSpotter('seals');
    const r = await runSpotter('History', statements, 1, {
      llm,
      prompt: PROMPT,
      budget: new Budget(1),
      samples: 6,
      seed: 's',
    });
    expect(r).toMatchObject({ detectionRate: 1, samples: 6 });
    expect(new Set(requests.map((q) => q.user)).size).toBeGreaterThan(1);
    expect(requests[0]).toMatchObject({ model: 'claude-haiku-5-5', effort: 'low' });
  });

  it('reports 0 when the spotter never finds it', async () => {
    const { llm } = fakeSpotter('Quillmouth');
    const r = await runSpotter('History', statements, 1, {
      llm,
      prompt: PROMPT,
      budget: new Budget(1),
      samples: 4,
      seed: 's',
    });
    expect(r.detectionRate).toBe(0);
  });

  it('treats a lie it could never score as fully detectable', async () => {
    const { llm } = fakeSpotter('x', { fail: true });
    const r = await runSpotter('History', statements, 1, {
      llm,
      prompt: PROMPT,
      budget: new Budget(1),
      samples: 3,
      seed: 's',
    });
    expect(r).toMatchObject({ detectionRate: 1, samples: 0 });
  });
});

describe('helpers', () => {
  it('flags heuristic tells', () => {
    const truths: [string, string] = [T1.text, T2.text];
    expect(heuristicFlags(SUBTLE.text, truths)).toEqual([]);
    expect(heuristicFlags(OBVIOUS.text, truths)).toEqual(['exclamation']);
    expect(heuristicFlags('A short one.', truths)).toEqual(['length-outlier', 'number-mismatch']);
    expect(heuristicFlags(`${SUBTLE.text.slice(0, 60)} called "the Tok".`, truths)).toContain(
      'quote-only-in-lie',
    );
  });

  it('maps fool rate to difficulty', () => {
    expect([0.1, 0.3, 0.4, 0.6, 0.9].map(difficultyFor)).toEqual([1, 2, 3, 4, 5]);
  });

  it('balances lie positions across rounds', () => {
    const p = balancedPositions(9, 's');
    expect([0, 1, 2].map((i) => p.filter((x) => x === i).length)).toEqual([3, 3, 3]);
    expect(balancedPositions(9, 's')).toEqual(p);
  });

  it('ranks lies by plausibility, then detection, then flags', () => {
    const s = (lieId: string, rate: number, flags: number, plausibility: number): LieScore => ({
      lieId,
      text: lieId,
      spotterDetectionRate: rate,
      spotterSamples: 10,
      heuristicFlags: Array(flags).fill('hedging'),
      plausibility,
    });
    expect(
      rankLies([s('a', 0.5, 0, 3), s('b', 0.2, 1, 3), s('c', 0.2, 0, 3), s('d', 0.6, 0, 4)]).map(
        (x) => x.lieId,
      ),
    ).toEqual(['d', 'c', 'b', 'a']);
  });

  it('places the lie at the given index; truths keep their reveal and source', () => {
    const cards = placeLie([T1, T2], SUBTLE, 0);
    expect(cards.map((c) => c.text)).toEqual([SUBTLE.text, T1.text, T2.text]);
    expect(cards[0]).toEqual({ text: SUBTLE.text });
    expect(cards[1]).toMatchObject({ expansion: 'More about t1.', source: { title: 't1' } });
  });
});

describe('assembleRounds', () => {
  it('picks the lie the spotter misses and writes a valid round', async () => {
    const { llm } = fakeSpotter('seals');
    const { rounds, unassembled } = await assembleRounds(
      [T1, T2],
      [record([OBVIOUS, SUBTLE])],
      [verdict('obvious', true), verdict('subtle', true)],
      CTX,
      { llm, prompt: PROMPT, budget: new Budget(1), samples: 4, seed: 's' },
    );
    expect(unassembled).toEqual([]);
    const r = CandidateRoundSchema.parse(rounds[0]);
    expect(RoundSchema.safeParse(r.round).success).toBe(true);
    expect(r).toMatchObject({
      lieId: 'subtle',
      spotterDetectionRate: 0,
      predictedFoolRate: 1,
      truthIds: ['t1', 't2'],
    });
    expect(r.round.statements[r.round.lieIndex]).toEqual({ text: SUBTLE.text });
    expect(r.round).toMatchObject({ difficulty: 5, lieNote: SUBTLE.lieNote, category: 'History' });
    expect(r.alternates.map((a) => [a.lieId, a.spotterDetectionRate])).toEqual([['obvious', 1]]);
  });

  it('uses only lies that passed verification', async () => {
    const { llm, requests } = fakeSpotter('none');
    const { rounds } = await assembleRounds(
      [T1, T2],
      [record([OBVIOUS, SUBTLE])],
      [verdict('obvious', true), verdict('subtle', false)],
      CTX,
      {
        llm,
        prompt: PROMPT,
        budget: new Budget(1),
        samples: 2,
      },
    );
    expect(rounds[0]?.lieId).toBe('obvious');
    expect(requests).toHaveLength(2);
  });

  it('leaves a round unassembled when every lie is too easy to spot, keeping them for review', async () => {
    const { llm } = fakeSpotter('Danish');
    const { rounds, unassembled } = await assembleRounds(
      [T1, T2],
      [record([OBVIOUS, SUBTLE])],
      [verdict('obvious', true), verdict('subtle', true)],
      CTX,
      {
        llm,
        prompt: PROMPT,
        budget: new Budget(1),
        samples: 3,
      },
    );
    expect(rounds).toEqual([]);
    expect(unassembled[0]).toMatchObject({
      reason: expect.stringMatching(/spotted more than 70%/),
    });
    expect(unassembled[0]?.alternates).toHaveLength(2);
  });

  it('reports a round with no verified lie', async () => {
    const { llm } = fakeSpotter('x');
    const { unassembled } = await assembleRounds(
      [T1, T2],
      [record([SUBTLE])],
      [verdict('subtle', false)],
      CTX,
      { llm, prompt: PROMPT, budget: new Budget(1) },
    );
    expect(unassembled[0]?.reason).toBe('No lie passed verification');
  });
});
