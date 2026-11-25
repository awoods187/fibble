import type { LieIndex, Round } from '@fibble/shared';
import type { GenerationRecord, LieCandidate } from '../generate/schemas';
import type { Budget, CallUsage, LlmClient } from '../llm';
import { MODELS, STYLE_SPOTTER } from '../models';
import { type Prompt, render } from '../prompts';
import { seededShuffle } from '../shuffle';
import type { RewordedTruth, StageContext, Trace } from '../types';
import type { VerifiedLie } from '../verify/schemas';
import { heuristicFlags } from './heuristics';
import {
  type CandidateRound,
  CandidateRoundSchema,
  type LieScore,
  SpotterGuessSchema,
} from './schemas';

/**
 * Stage 5 (PRD section 5): for each truth pair, score every verified lie with the
 * style spotter and heuristics, pick the lie that is hardest to spot, place it at a
 * balanced position, and write the round in the shared puzzle format.
 */

export const SPOTTER_MAX_TOKENS = 2_000;

export interface AssembleOptions {
  llm: LlmClient;
  prompt: Prompt;
  budget: Budget;
  samples?: number;
  seed?: string;
}

export interface SpotterResult {
  detectionRate: number;
  samples: number;
  usage: CallUsage[];
}

/**
 * Show the spotter the three statements `samples` times, in a different order each
 * time (so position doesn't bias it), and count how often it picks the lie.
 */
export async function runSpotter(
  category: string,
  statements: [string, string, string],
  lieIndex: LieIndex,
  opts: AssembleOptions & { seed: string },
): Promise<SpotterResult> {
  const samples = opts.samples ?? STYLE_SPOTTER.samples;
  const usage: CallUsage[] = [];
  let found = 0;
  let answered = 0;
  for (let s = 0; s < samples; s++) {
    if (opts.budget.exhausted) break;
    const order = seededShuffle([0, 1, 2], `${opts.seed}:${s}`);
    const call = await opts.llm.structured({
      model: MODELS.styleSpotter,
      system: opts.prompt.system,
      user: render(opts.prompt.user, {
        category,
        statements: order.map((i, n) => `${n + 1}. ${statements[i]}`).join('\n'),
      }),
      schema: SpotterGuessSchema,
      maxTokens: SPOTTER_MAX_TOKENS,
      effort: 'low',
    });
    usage.push(call.usage);
    opts.budget.add(call.usage);
    if (!call.ok) continue;
    const picked = order[call.output.pick - 1];
    if (picked === undefined) continue; // an out-of-range answer doesn't count
    answered++;
    if (picked === lieIndex) found++;
  }
  return { detectionRate: answered ? found / answered : 1, samples: answered, usage };
}

/** Predicted difficulty from the predicted fool rate (share of players who'd miss the lie). */
export function difficultyFor(foolRate: number): 1 | 2 | 3 | 4 | 5 {
  if (foolRate < 0.2) return 1;
  if (foolRate < 0.35) return 2;
  if (foolRate < 0.5) return 3;
  if (foolRate < 0.65) return 4;
  return 5;
}

/** Lie positions for n rounds: each of 0, 1, 2 used equally often, in a seeded order. */
export function balancedPositions(n: number, seed: string): LieIndex[] {
  const cycle: LieIndex[] = [];
  for (let i = 0; i < n; i++) cycle.push((i % 3) as LieIndex);
  return seededShuffle(cycle, `${seed}:positions`);
}

/**
 * Best lie first: most plausible, then least often spotted, then fewest flags.
 * Plausibility leads because it matched a human's believability ratings to within
 * 0.1 points, while the Haiku spotter's picks didn't (ADR 0011). The spotter still
 * vetoes any lie found more than 70% of the time.
 */
export function rankLies(scores: LieScore[]): LieScore[] {
  return [...scores].sort(
    (a, b) =>
      (b.plausibility ?? 0) - (a.plausibility ?? 0) ||
      a.spotterDetectionRate - b.spotterDetectionRate ||
      a.heuristicFlags.length - b.heuristicFlags.length,
  );
}

export interface Unassembled {
  truthIds: [string, string];
  reason: string;
  alternates: LieScore[];
}

export interface AssembleResult {
  rounds: CandidateRound[];
  unassembled: Unassembled[];
  spentUsd: number;
}

export async function assembleRounds(
  truths: RewordedTruth[],
  records: GenerationRecord[],
  verified: VerifiedLie[],
  ctx: StageContext,
  opts: AssembleOptions,
): Promise<AssembleResult> {
  const seed = opts.seed ?? ctx.now.toISOString().slice(0, 10);
  const byId = new Map(truths.map((t) => [t.candidateId, t]));
  const verdicts = new Map(verified.map((v) => [v.lie.id, v]));
  const trace: Trace = {
    stage: 'assemble',
    promptVersion: opts.prompt.version,
    model: MODELS.styleSpotter,
    createdAt: ctx.now.toISOString(),
  };

  // Rounds that have truths and at least one lie that passed verification.
  const work = records.flatMap((r) => {
    const a = byId.get(r.truthIds[0]);
    const b = byId.get(r.truthIds[1]);
    const lies = r.accepted.filter((l) => verdicts.get(l.id)?.passed);
    return a && b ? [{ record: r, pair: [a, b] as [RewordedTruth, RewordedTruth], lies }] : [];
  });
  const positions = balancedPositions(work.length, seed);
  const rounds: CandidateRound[] = [];
  const unassembled: Unassembled[] = [];

  for (const [w, { record, pair, lies }] of work.entries()) {
    if (!lies.length) {
      unassembled.push({
        truthIds: record.truthIds,
        reason: 'No lie passed verification',
        alternates: [],
      });
      continue;
    }
    const lieIndex = positions[w] ?? 0;
    const usage: CallUsage[] = [];
    const scores: LieScore[] = [];
    for (const lie of lies) {
      if (opts.budget.exhausted) break;
      const statements = placeLie(pair, lie, lieIndex).map((s) => s.text) as [
        string,
        string,
        string,
      ];
      const spot = await runSpotter(record.category, statements, lieIndex, {
        ...opts,
        seed: `${seed}:${lie.id}`,
      });
      usage.push(...spot.usage);
      scores.push({
        lieId: lie.id,
        text: lie.text,
        spotterDetectionRate: spot.detectionRate,
        spotterSamples: spot.samples,
        heuristicFlags: heuristicFlags(lie.text, [pair[0].text, pair[1].text]),
        plausibility: verdicts.get(lie.id)?.plausibility,
      });
    }
    const ranked = rankLies(scores);
    const best = ranked.find(
      (s) => s.spotterSamples > 0 && s.spotterDetectionRate <= STYLE_SPOTTER.maxDetectionRate,
    );
    if (!best) {
      unassembled.push({
        truthIds: record.truthIds,
        reason: scores.length
          ? `Every lie was spotted more than ${STYLE_SPOTTER.maxDetectionRate * 100}% of the time`
          : 'Budget reached before scoring',
        alternates: ranked,
      });
      continue;
    }
    const lie = lies.find((l) => l.id === best.lieId) as LieCandidate;
    const foolRate = 1 - best.spotterDetectionRate;
    const round: Round = {
      category: record.category,
      difficulty: difficultyFor(foolRate),
      statements: placeLie(pair, lie, lieIndex),
      lieIndex,
      lieNote: lie.lieNote,
    };
    rounds.push(
      CandidateRoundSchema.parse({
        round,
        truthIds: record.truthIds,
        lieId: lie.id,
        spotterDetectionRate: best.spotterDetectionRate,
        plausibility: best.plausibility,
        heuristicFlags: best.heuristicFlags,
        predictedFoolRate: foolRate,
        alternates: ranked.filter((s) => s.lieId !== best.lieId),
        usage,
        trace,
      }),
    );
  }
  return { rounds, unassembled, spentUsd: opts.budget.spentUsd };
}

/** The three cards in order, with the lie at `lieIndex`. Truths carry their reveal and source. */
export function placeLie(
  pair: [RewordedTruth, RewordedTruth],
  lie: LieCandidate,
  lieIndex: LieIndex,
): Round['statements'] {
  const truthCards = pair.map((t) => ({ text: t.text, expansion: t.expansion, source: t.source }));
  const cards: Round['statements'] = [...truthCards];
  cards.splice(lieIndex, 0, { text: lie.text });
  return cards;
}
