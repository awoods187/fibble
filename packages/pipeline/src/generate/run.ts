import { createHash } from 'node:crypto';
import type { Budget, CallUsage, Effort, LlmClient } from '../llm';
import { MODELS } from '../models';
import { type Prompt, render } from '../prompts';
import type { RewordedTruth, StageContext, Trace } from '../types';
import type { VerifiedLie } from '../verify/schemas';
import { checkLie, duplicateIndexes } from './checks';
import {
  type GenerationRecord,
  GenerationRecordSchema,
  GeneratedLiesSchema,
  type LieCandidate,
  type RejectedLie,
} from './schemas';

export const GENERATE_MAX_TOKENS = 16_000;
/** PRD: 5 candidate lies per round. */
export const DEFAULT_LIE_COUNT = 5;

export type TruthPair = [RewordedTruth, RewordedTruth];

/** Pair truths within each category, in input order. An odd truth out is left unpaired. */
export function pairTruths(truths: RewordedTruth[]): TruthPair[] {
  const byCategory = new Map<string, RewordedTruth[]>();
  for (const t of truths) byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
  const pairs: TruthPair[] = [];
  for (const group of byCategory.values()) {
    for (let i = 0; i + 1 < group.length; i += 2) {
      const a = group[i];
      const b = group[i + 1];
      if (a && b) pairs.push([a, b]);
    }
  }
  return pairs;
}

export function lieId(truthIds: [string, string], text: string): string {
  return `lie-${createHash('sha256')
    .update(`${truthIds.join('|')}|${text}`)
    .digest('hex')
    .slice(0, 12)}`;
}

export interface GenerateOptions {
  llm: LlmClient;
  prompt: Prompt;
  budget: Budget;
  count?: number;
  effort?: Effort;
}

/**
 * Stage 3: for each truth pair, Opus writes `count` lies; code checks drop the
 * ones that break the PRD rules or repeat each other. Survivors go to stage 4.
 */
export async function generateForPairs(
  pairs: TruthPair[],
  ctx: StageContext,
  opts: GenerateOptions,
): Promise<{ records: GenerationRecord[]; notStarted: number }> {
  const count = opts.count ?? DEFAULT_LIE_COUNT;
  const records: GenerationRecord[] = [];
  const trace: Trace = {
    stage: 'generateLies',
    promptVersion: opts.prompt.version,
    model: MODELS.generateLies,
    createdAt: ctx.now.toISOString(),
  };

  for (const [i, pair] of pairs.entries()) {
    if (opts.budget.exhausted) return { records, notStarted: pairs.length - i };
    const truthIds: [string, string] = [pair[0].candidateId, pair[1].candidateId];
    const category = pair[0].category;
    const usage: CallUsage[] = [];

    const call = await opts.llm.structured({
      model: MODELS.generateLies,
      system: render(opts.prompt.system, { count: String(count) }),
      user: render(opts.prompt.user, {
        category,
        truth_1: pair[0].text,
        truth_2: pair[1].text,
        count: String(count),
      }),
      schema: GeneratedLiesSchema,
      maxTokens: GENERATE_MAX_TOKENS,
      effort: opts.effort ?? 'high',
    });
    usage.push(call.usage);
    opts.budget.add(call.usage);

    const base = { category, truthIds, requested: count, usage, trace };
    if (!call.ok) {
      records.push(
        GenerationRecordSchema.parse({
          ...base,
          returned: 0,
          accepted: [],
          rejected: [],
          error: call.reason,
        }),
      );
      continue;
    }

    const lies = call.output.lies;
    const dupes = duplicateIndexes(lies);
    const accepted: LieCandidate[] = [];
    const rejected: RejectedLie[] = [];
    lies.forEach((lie, k) => {
      const failures = checkLie(lie, pair);
      if (dupes.has(k))
        failures.push({ reason: 'duplicate', detail: 'Near-duplicate of an earlier lie' });
      if (failures.length) {
        rejected.push({
          basedOnTruthIds: truthIds,
          lie,
          reasons: [...new Set(failures.map((f) => f.reason))],
          details: failures.map((f) => f.detail),
        });
        return;
      }
      const text = lie.text.trim();
      accepted.push({
        id: lieId(truthIds, text),
        category,
        text,
        lieNote: lie.lieNote.trim(),
        borrowedTexture: lie.borrowedTexture.trim(),
        basedOnTruthIds: truthIds,
        trace,
      });
    });
    records.push(
      GenerationRecordSchema.parse({ ...base, returned: lies.length, accepted, rejected }),
    );
  }
  return { records, notStarted: 0 };
}

export interface RoundSummary {
  category: string;
  truthIds: [string, string];
  generated: number;
  passedChecks: number;
  passedVerification: number;
  supported: number;
  bestPlausibility?: number;
  /** Truths' share of stage 2, plus generation and verification of this round's lies. */
  costUsd: number;
}

export interface Gate2Report {
  rounds: number;
  /** Rounds with at least one lie that passed verification: usable rounds. */
  roundsWithPassingLie: number;
  liesGenerated: number;
  liesPassedChecks: number;
  liesPassedVerification: number;
  /** Generated "lies" the judge found to be true. These would have been false lies. */
  liesSupported: number;
  plausibility: Record<string, number>;
  costPerRoundUsd: number;
  roundsDetail: RoundSummary[];
}

const sumUsd = (usage: { usd: number }[]) => usage.reduce((n, u) => n + u.usd, 0);

/** Gate 2 numbers: can we reliably make lies that pass verification, and at what cost? */
export function gate2Report(
  pairs: TruthPair[],
  records: GenerationRecord[],
  verified: VerifiedLie[],
): Gate2Report {
  const verdicts = new Map(verified.map((v) => [v.lie.id, v]));
  const plausibility: Record<string, number> = {};
  const roundsDetail: RoundSummary[] = records.map((r) => {
    const pair = pairs.find(
      (p) => p[0].candidateId === r.truthIds[0] && p[1].candidateId === r.truthIds[1],
    );
    const vs = r.accepted
      .map((l) => verdicts.get(l.id))
      .filter((v): v is VerifiedLie => Boolean(v));
    for (const v of vs) {
      if (v.plausibility !== undefined)
        plausibility[v.plausibility] = (plausibility[v.plausibility] ?? 0) + 1;
    }
    const passing = vs.filter((v) => v.passed);
    return {
      category: r.category,
      truthIds: r.truthIds,
      generated: r.returned,
      passedChecks: r.accepted.length,
      passedVerification: passing.length,
      supported: vs.filter((v) => v.label === 'supported').length,
      bestPlausibility: Math.max(...vs.map((v) => v.plausibility ?? 0)) || undefined,
      costUsd:
        sumUsd(r.usage) +
        vs.reduce((n, v) => n + sumUsd(v.usage), 0) +
        (pair ? sumUsd(pair[0].usage) + sumUsd(pair[1].usage) : 0),
    };
  });
  const total = (f: (r: RoundSummary) => number) => roundsDetail.reduce((n, r) => n + f(r), 0);
  return {
    rounds: roundsDetail.length,
    roundsWithPassingLie: roundsDetail.filter((r) => r.passedVerification > 0).length,
    liesGenerated: total((r) => r.generated),
    liesPassedChecks: total((r) => r.passedChecks),
    liesPassedVerification: total((r) => r.passedVerification),
    liesSupported: total((r) => r.supported),
    plausibility,
    costPerRoundUsd: roundsDetail.length ? total((r) => r.costUsd) / roundsDetail.length : 0,
    roundsDetail,
  };
}
