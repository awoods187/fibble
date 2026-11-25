import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Round } from '@fibble/shared';
import { describe, expect, it } from 'vitest';
import type { CandidateRound } from '../assemble/schemas';
import type { LieCandidate } from '../generate/schemas';
import { buildReviewPage } from './page';
import { applyDecisions, buildReviewItems, reviewSetIdFor, roundIdFor, withLie } from './review';
import { ApprovedRoundSchema, type ReviewDecisions } from './schemas';

// The public sample day: real-format rounds, one per category, no private content.
const SAMPLE = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../content-example/2026-11-24.json'), 'utf8'),
) as { rounds: Round[] };
const ROUND = SAMPLE.rounds[0]!;
const TRACE = {
  stage: 'assemble' as const,
  promptVersion: 'test-v1',
  createdAt: '2026-11-25T00:00:00.000Z',
};

const lie = (id: string, text: string, lieNote: string): LieCandidate => ({
  id,
  category: ROUND.category,
  text,
  lieNote,
  borrowedTexture: 'x',
  basedOnTruthIds: ['t1', 't2'],
  trace: { stage: 'generateLies', promptVersion: 'test-v1', createdAt: '2026-11-25T00:00:00.000Z' },
});
const ALT = lie(
  'lie-alt',
  'In 1872 the city of Lucerne briefly required every rowing boat on its lake to carry a small brass bell.',
  'Plausible because Swiss lakes had many boating rules; this one is invented.',
);
const CANDIDATE: CandidateRound = {
  round: ROUND,
  truthIds: ['t1', 't2'],
  lieId: 'lie-main',
  spotterDetectionRate: 0.2,
  plausibility: 4,
  heuristicFlags: [],
  predictedFoolRate: 0.8,
  alternates: [
    {
      lieId: 'lie-alt',
      text: ALT.text,
      spotterDetectionRate: 0.3,
      spotterSamples: 10,
      heuristicFlags: [],
      plausibility: 3,
    },
  ],
  usage: [],
  trace: TRACE,
};
const LIES = [lie('lie-main', ROUND.statements[ROUND.lieIndex]!.text, ROUND.lieNote), ALT];

describe('buildReviewItems', () => {
  const [item] = buildReviewItems([CANDIDATE], LIES);

  it('shows the truths with their reveal and source, then the chosen lie and alternates', () => {
    expect(item?.roundId).toBe(roundIdFor(['t1', 't2']));
    expect(item?.truths).toHaveLength(2);
    expect(item?.truths[0]?.sourceUrl).toMatch(/^https:\/\/en\.wikipedia\.org\//);
    expect(item?.lies.map((l) => [l.lieId, l.plausibility])).toEqual([
      ['lie-main', 4],
      ['lie-alt', 3],
    ]);
    expect(item?.lies[1]?.lieNote).toBe(ALT.lieNote);
  });
});

describe('applyDecisions', () => {
  const setId = reviewSetIdFor([roundIdFor(['t1', 't2'])]);
  const decide = (d: ReviewDecisions['decisions']): ReviewDecisions => ({
    setId,
    decidedAt: '2026-11-25T20:00:00.000Z',
    decisions: d,
  });

  it('approves a round as assembled', () => {
    const { approved, log } = applyDecisions(
      [CANDIDATE],
      LIES,
      decide([{ roundId: roundIdFor(['t1', 't2']), decision: 'approved', lieId: 'lie-main' }]),
      'Andy',
    );
    expect(ApprovedRoundSchema.parse(approved[0])).toMatchObject({
      lieId: 'lie-main',
      reviewedBy: 'Andy',
      reviewSetId: setId,
    });
    expect(approved[0]?.round).toEqual(ROUND);
    expect(approved[0]?.sourceTitles).toHaveLength(2);
    expect(log.counts).toEqual({ approved: 1, rejected: 0, undecided: 0 });
    expect(log.decisions[0]).toMatchObject({ usedAlternateLie: false, promptVersion: 'test-v1' });
  });

  it('swaps in an alternate lie at the same position, with its note', () => {
    const { approved, log } = applyDecisions(
      [CANDIDATE],
      LIES,
      decide([{ roundId: roundIdFor(['t1', 't2']), decision: 'approved', lieId: 'lie-alt' }]),
      'Andy',
    );
    const r = approved[0]!.round;
    expect(r.statements[r.lieIndex]).toEqual({ text: ALT.text });
    expect(r.lieNote).toBe(ALT.lieNote);
    expect(r.statements.filter((_, i) => i !== r.lieIndex)).toEqual(
      ROUND.statements.filter((_, i) => i !== ROUND.lieIndex),
    );
    expect(log.decisions[0]?.usedAlternateLie).toBe(true);
  });

  it('records a rejection with its reason, and counts undecided rounds', () => {
    const rejected = applyDecisions(
      [CANDIDATE],
      LIES,
      decide([
        {
          roundId: roundIdFor(['t1', 't2']),
          decision: 'rejected',
          reason: 'not-ok',
          note: 'politics',
        },
      ]),
      'Andy',
    );
    expect(rejected.approved).toEqual([]);
    expect(rejected.log.decisions[0]).toMatchObject({
      decision: 'rejected',
      reason: 'not-ok',
      note: 'politics',
    });
    expect(applyDecisions([CANDIDATE], LIES, decide([]), 'Andy').log.counts.undecided).toBe(1);
  });

  it('refuses decisions for another review set, an unknown round, or an unknown lie', () => {
    expect(() =>
      applyDecisions([CANDIDATE], LIES, { ...decide([]), setId: 'review-other' }, 'Andy'),
    ).toThrow(/review set/);
    expect(() =>
      applyDecisions(
        [CANDIDATE],
        LIES,
        decide([{ roundId: 'round-nope', decision: 'approved', lieId: 'x' }]),
        'Andy',
      ),
    ).toThrow(/Unknown round/);
    expect(() =>
      applyDecisions(
        [CANDIDATE],
        LIES,
        decide([{ roundId: roundIdFor(['t1', 't2']), decision: 'approved', lieId: 'lie-nope' }]),
        'Andy',
      ),
    ).toThrow(/no lie/);
  });

  it('withLie validates the result as a round', () => {
    expect(() => withLie(ROUND, 'Too short.', 'x')).toThrow();
  });
});

describe('buildReviewPage', () => {
  const html = buildReviewPage('review-abc', buildReviewItems([CANDIDATE], LIES));

  it('is offline: a no-network CSP, and no scripts or styles from elsewhere', () => {
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<(script|link)[^>]+(src|href)=["']https?:/);
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
  });

  it('offers approve, reject with reasons, alternates and download', () => {
    for (const s of [
      'Approve',
      'Reject',
      'Not OK',
      'Lie might be true',
      'Download decisions',
      'Lies to choose from',
    ]) {
      expect(html).toContain(s);
    }
  });
});
