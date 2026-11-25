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
import type { Candidate, StageContext } from '../types';
import { rewordCandidates } from './run';
import { RejectionSchema, type RewordDraft, RewordedTruthSchema } from './schemas';

const CTX: StageContext = {
  promptVersion: 'none',
  dryRun: false,
  now: new Date('2026-11-25T12:00:00Z'),
};

const PROMPTS = {
  reword: parsePrompt(
    'reword',
    'test-v1',
    '# System\nCats: {{categories}}\n# User\n{{hook}}|{{article_title}}|{{evidence}}',
  ),
  entailment: parsePrompt(
    'entailment',
    'test-v1',
    '# System\nCheck.\n# User\n{{statement}}|{{expansion}}|{{evidence}}|{{article_title}}',
  ),
};

// Made-up content; no real Wikipedia text.
function candidate(id: string, extra: Partial<Candidate> = {}): Candidate {
  return {
    id,
    harvestedFrom: 'dyk',
    month: '2024-05',
    rawClaim: '... that the Glass Lighthouse of Vell was lit by candles until 1931?',
    article: {
      title: 'Glass Lighthouse of Vell',
      url: 'https://en.wikipedia.org/wiki/Glass_Lighthouse_of_Vell',
      revisionId: 1,
    },
    contextText: 'Keepers lit its lamp with tallow candles until 1931, when oil lamps arrived.',
    involvesLivingPerson: false,
    livingPeople: [],
    trace: { stage: 'harvest', promptVersion: 'none', createdAt: '2026-11-25T00:00:00.000Z' },
    ...extra,
  };
}

const GOOD_DRAFT: RewordDraft = {
  text: 'An imaginary coastal beacon, the Glass Lighthouse of Vell, relied on tallow candles for light right up until 1931.',
  expansion: 'Oil lamps finally replaced the candles in 1931.',
  supportingSentence:
    'Keepers lit its lamp with tallow candles until 1931, when oil lamps arrived.',
  category: 'History',
  entities: ['Glass Lighthouse of Vell'],
  surprise: 4,
  verifiability: 5,
  contentFlags: [],
};

type Reply = StructuredResult<unknown>;
const usage = (model: CallUsage['model'], usd: number): CallUsage => ({
  model,
  inputTokens: 100,
  outputTokens: 50,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  usd,
});
const draftReply = (d: Partial<RewordDraft> = {}): Reply => ({
  ok: true,
  output: { ...GOOD_DRAFT, ...d },
  usage: usage('claude-haiku-5-5', 0.001),
});
const entailReply = (supported: boolean, details: string[] = []): Reply => ({
  ok: true,
  output: { supported, unsupportedDetails: details },
  usage: usage('claude-opus-5-5', 0.03),
});

/** Answers each call from a queue and records the requests. */
function fakeLlm(replies: Reply[]) {
  const requests: StructuredRequest<z.ZodType>[] = [];
  const llm: LlmClient = {
    structured: async (req) => {
      requests.push(req);
      const reply = replies.shift();
      if (!reply) throw new Error('unexpected LLM call');
      return reply as never;
    },
  };
  return { llm, requests };
}

const run = (candidates: Candidate[], replies: Reply[], budgetUsd = 10) => {
  const fake = fakeLlm(replies);
  return rewordCandidates(candidates, CTX, {
    llm: fake.llm,
    prompts: PROMPTS,
    budget: new Budget(budgetUsd),
  }).then((r) => ({ ...r, requests: fake.requests }));
};

describe('rewordCandidates', () => {
  it('accepts a draft that passes the checks and entailment, with usage and trace', async () => {
    const { accepted, rejected, stats, requests } = await run(
      [candidate('c1')],
      [draftReply(), entailReply(true)],
    );
    expect(rejected).toEqual([]);
    expect(accepted).toHaveLength(1);
    const truth = RewordedTruthSchema.parse(accepted[0]);
    expect(truth).toMatchObject({
      candidateId: 'c1',
      category: 'History',
      source: { title: 'Glass Lighthouse of Vell', revisionId: 1 },
      scores: { surprise: 4, verifiability: 5 },
      trace: { stage: 'reword', promptVersion: 'test-v1', model: 'claude-opus-5-5' },
    });
    expect(truth.usage.map((u) => u.model)).toEqual(['claude-haiku-5-5', 'claude-opus-5-5']);
    expect(stats).toMatchObject({ accepted: 1, spentUsd: 0.031 });

    // Haiku drafts, Opus checks, and the prompts are filled in.
    expect(requests.map((r) => r.model)).toEqual(['claude-haiku-5-5', 'claude-opus-5-5']);
    expect(requests[0]?.system).toContain('"Science & Nature"');
    expect(requests[0]?.user).toContain('Glass Lighthouse of Vell|Keepers lit');
    expect(requests[1]?.user.startsWith(GOOD_DRAFT.text)).toBe(true);
    expect(requests.map((r) => r.effort)).toEqual(['medium', 'high']);
  });

  it('rejects living-person candidates without any LLM call', async () => {
    const { rejected, requests } = await run(
      [candidate('c1', { involvesLivingPerson: true, livingPeople: ['Ada Quill'] })],
      [],
    );
    expect(requests).toEqual([]);
    expect(rejected[0]).toMatchObject({
      stage: 'filter',
      reasons: ['living-person'],
      details: ['Living: Ada Quill'],
      usage: [],
    });
  });

  it('rejects a draft that fails the code checks without calling Opus', async () => {
    const { rejected, requests, stats } = await run(
      [candidate('c1')],
      [draftReply({ surprise: 2, contentFlags: ['tragedy'] })],
    );
    expect(requests).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ stage: 'checks', reasons: ['low-score', 'content-flag'] });
    expect(rejected[0]?.draft?.surprise).toBe(2);
    expect(stats.reasons).toEqual({ 'low-score': 1, 'content-flag': 1 });
  });

  it('rejects, never repairs, a draft the entailment check does not fully support', async () => {
    const { accepted, rejected } = await run(
      [candidate('c1'), candidate('c2')],
      [
        draftReply(),
        entailReply(false, ['"right up until 1931": evidence says until 1931']),
        draftReply(),
        entailReply(true, ['date']),
      ],
    );
    expect(accepted).toEqual([]);
    expect(rejected.map((r) => [r.stage, r.reasons])).toEqual([
      ['entailment', ['not-entailed']],
      ['entailment', ['not-entailed']],
    ]);
    expect(rejected[0]?.details).toEqual(['"right up until 1931": evidence says until 1931']);
  });

  it('records a refusal or unparseable reply as a rejection with its cost', async () => {
    const { rejected } = await run(
      [candidate('c1'), candidate('c2')],
      [
        {
          ok: false,
          reason: 'refusal',
          detail: 'general_harms',
          usage: usage('claude-haiku-5-5', 0.001),
        },
        draftReply(),
        { ok: false, reason: 'unparseable', usage: usage('claude-opus-5-5', 0.02) },
      ],
    );
    expect(rejected.map((r) => [r.stage, r.reasons[0], r.usage.length])).toEqual([
      ['draft', 'refusal', 1],
      ['entailment', 'unparseable', 2],
    ]);
    for (const r of rejected) expect(RejectionSchema.safeParse(r).success).toBe(true);
  });

  it('stops starting new candidates once the budget is spent', async () => {
    const { accepted, stats, requests } = await run(
      [candidate('c1'), candidate('c2'), candidate('c3')],
      [draftReply(), entailReply(true)],
      0.03,
    );
    expect(accepted).toHaveLength(1);
    expect(requests).toHaveLength(2);
    expect(stats).toMatchObject({ notStarted: 2, accepted: 1 });
  });

  it('rejects a hook on a banned topic before any LLM call', async () => {
    const { rejected, requests } = await run(
      [
        candidate('c1', {
          rawClaim: '... that students marched in Nazi uniforms in a school parade?',
        }),
      ],
      [],
    );
    expect(requests).toEqual([]);
    expect(rejected[0]).toMatchObject({ stage: 'filter', reasons: ['sensitive-topic'], usage: [] });
  });

  it('rejects a draft whose reveal touches a banned topic, without calling Opus', async () => {
    const { rejected, requests } = await run(
      [candidate('c1')],
      [draftReply({ expansion: 'The lighthouse was later the site of a massacre.' })],
    );
    expect(requests).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ stage: 'checks', reasons: ['sensitive-topic'] });
  });
});
