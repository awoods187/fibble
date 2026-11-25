import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VerifiedLie } from '../verify/schemas';
import { GoldenSetSchema, goldenToLies, scoreVerifyEval, type GoldenSet } from './verify-eval';

const SOURCE = { title: 'T', url: 'https://en.wikipedia.org/wiki/T', revisionId: 1 };
const SET: GoldenSet = {
  version: 'test',
  items: [
    {
      id: 't1',
      category: 'History',
      text: 'truth one',
      expected: 'truth',
      expectedJudgeLabel: 'supported',
      source: SOURCE,
    },
    {
      id: 't2',
      category: 'History',
      text: 'truth two',
      expected: 'truth',
      expectedJudgeLabel: 'supported',
      source: SOURCE,
    },
    {
      id: 'l1',
      category: 'History',
      text: 'lie one',
      expected: 'lie',
      expectedJudgeLabel: 'no-evidence',
    },
    {
      id: 'l2',
      category: 'History',
      text: 'lie two',
      expected: 'lie',
      expectedJudgeLabel: 'contradicted',
    },
    {
      id: 'l3',
      category: 'History',
      text: 'lie three',
      expected: 'lie',
      expectedJudgeLabel: 'no-evidence',
    },
    {
      id: 'l4',
      category: 'History',
      text: 'lie four',
      expected: 'lie',
      expectedJudgeLabel: 'no-evidence',
    },
  ],
};

function verdict(id: string, fields: Partial<VerifiedLie>): VerifiedLie {
  return {
    lie: { id, category: 'History', text: id },
    queries: [],
    evidence: [],
    judgeRationale: '',
    citedEvidence: [],
    passed: false,
    searchErrors: [],
    usage: [],
    webSearches: 2,
    trace: { stage: 'verify', promptVersion: 'x', createdAt: '2026-11-25T00:00:00.000Z' },
    ...fields,
  };
}

describe('scoreVerifyEval', () => {
  const report = scoreVerifyEval(
    SET,
    [
      verdict('t1', { label: 'supported', plausibility: 5 }),
      verdict('t2', { label: 'no-evidence', plausibility: 4, passed: true }), // the bad one
      verdict('l1', { label: 'no-evidence', plausibility: 4, passed: true }),
      verdict('l2', { label: 'supported', plausibility: 4 }),
      verdict('l3', { label: 'contradicted', plausibility: 2 }),
      verdict('l4', { error: 'no-retrieval' }),
    ],
    0.5,
  );

  it('counts a truth that passed as a false lie', () => {
    expect(report).toMatchObject({ truths: 2, falseLieRate: 0.5, truthsNotCaught: 1 });
    expect(report.misses[0]).toMatchObject({ id: 't2', why: expect.stringMatching(/^FALSE LIE/) });
  });

  it('scores lie recall and explains each lie that failed', () => {
    expect(report).toMatchObject({
      lies: 4,
      lieRecall: 0.25,
      liesLabeledSupported: 1,
      liesLowPlausibility: 1,
      unjudged: 1,
    });
    expect(report.misses.map((m) => m.id)).toEqual(['t2', 'l2', 'l3', 'l4']);
  });

  it('tallies labels by expected answer and totals searches and cost', () => {
    expect(report.labels.truth).toEqual({
      supported: 1,
      contradicted: 0,
      'no-evidence': 1,
      unjudged: 0,
    });
    expect(report.labels.lie).toEqual({
      supported: 1,
      contradicted: 1,
      'no-evidence': 1,
      unjudged: 1,
    });
    expect(report).toMatchObject({ webSearches: 12, spentUsd: 0.5 });
  });

  it('ignores items that were not run', () => {
    const partial = scoreVerifyEval(
      SET,
      [verdict('t1', { label: 'supported', plausibility: 5 })],
      0,
    );
    expect(partial).toMatchObject({ truths: 1, lies: 0, falseLieRate: 0, lieRecall: 0 });
  });
});

describe('GoldenSetSchema', () => {
  it('accepts the example golden set', async () => {
    const file = resolve(import.meta.dirname, '../../evals/golden-set.example.json');
    expect(GoldenSetSchema.safeParse(JSON.parse(await readFile(file, 'utf8'))).success).toBe(true);
  });

  it('requires a source on truths and none on lies, with matching expected labels', () => {
    const bad = (item: object) =>
      !GoldenSetSchema.safeParse({ version: 'x', items: [item] }).success;
    const base = { id: 'a', category: 'History', text: 't' };
    expect(bad({ ...base, expected: 'truth', expectedJudgeLabel: 'supported' })).toBe(true);
    expect(
      bad({ ...base, expected: 'lie', expectedJudgeLabel: 'no-evidence', source: SOURCE }),
    ).toBe(true);
    expect(bad({ ...base, expected: 'lie', expectedJudgeLabel: 'supported' })).toBe(true);
  });

  it('turns items into verifier inputs', () => {
    expect(goldenToLies(SET)[0]).toEqual({ id: 't1', category: 'History', text: 'truth one' });
  });
});
