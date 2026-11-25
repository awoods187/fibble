import { CATEGORY_NAMES } from '@fibble/shared';
import { type Budget, type CallUsage, type Effort, type LlmClient } from '../llm';
import { MODELS } from '../models';
import { type Prompt, render } from '../prompts';
import type { Candidate, RewordedTruth, StageContext, Trace } from '../types';
import { checkDraft } from './checks';
import {
  EntailmentSchema,
  type Rejection,
  type RejectionReason,
  RewordDraftSchema,
  RewordedTruthSchema,
  RejectionSchema,
} from './schemas';

export interface RewordPrompts {
  reword: Prompt;
  entailment: Prompt;
}

export interface RewordOptions {
  llm: LlmClient;
  prompts: RewordPrompts;
  budget: Budget;
  /** Draft effort (Haiku). Low-stakes and high-volume. */
  draftEffort?: Effort;
  /** Entailment effort (Opus). The worst failure is a false "truth", so default high. */
  entailmentEffort?: Effort;
}

export interface RewordStats {
  candidates: number;
  /** Candidates not started because the budget ran out. */
  notStarted: number;
  accepted: number;
  rejected: Record<Rejection['stage'], number>;
  reasons: Partial<Record<RejectionReason, number>>;
  spentUsd: number;
}

export interface RewordResult {
  accepted: RewordedTruth[];
  rejected: Rejection[];
  stats: RewordStats;
}

/** The category list as the reword prompt shows it. */
export const CATEGORY_LIST = CATEGORY_NAMES.map((c) => `"${c}"`).join(', ');

export const DRAFT_MAX_TOKENS = 8_000;
export const ENTAILMENT_MAX_TOKENS = 16_000;

/**
 * Stage 2: for each candidate, filter free, draft with Haiku, check in code,
 * then confirm entailment with Opus. Stops starting new candidates once the
 * budget is spent. Candidates run one at a time (ADR 0006).
 */
export async function rewordCandidates(
  candidates: Candidate[],
  ctx: StageContext,
  opts: RewordOptions,
): Promise<RewordResult> {
  const accepted: RewordedTruth[] = [];
  const rejected: Rejection[] = [];
  const stats: RewordStats = {
    candidates: candidates.length,
    notStarted: 0,
    accepted: 0,
    rejected: { filter: 0, draft: 0, checks: 0, entailment: 0 },
    reasons: {},
    spentUsd: 0,
  };
  const trace = (model?: Trace['model']): Trace => ({
    stage: 'reword',
    promptVersion: opts.prompts.reword.version,
    ...(model ? { model } : {}),
    createdAt: ctx.now.toISOString(),
  });

  const reject = (
    c: Candidate,
    stage: Rejection['stage'],
    reasons: RejectionReason[],
    details: string[],
    usage: CallUsage[],
    extra: Partial<Rejection> = {},
  ) => {
    const record = RejectionSchema.parse({
      candidateId: c.id,
      stage,
      reasons,
      details,
      usage,
      trace: trace(usage.at(-1)?.model as Trace['model']),
      ...extra,
    });
    rejected.push(record);
    stats.rejected[stage]++;
    for (const r of reasons) stats.reasons[r] = (stats.reasons[r] ?? 0) + 1;
  };

  for (const [i, c] of candidates.entries()) {
    // Free filter: never spend money on a hook that names a living person.
    if (c.involvesLivingPerson) {
      reject(c, 'filter', ['living-person'], [`Living: ${c.livingPeople.join(', ')}`], []);
      continue;
    }
    if (opts.budget.exhausted) {
      stats.notStarted = candidates.length - i;
      break;
    }

    const usage: CallUsage[] = [];
    const draftCall = await opts.llm.structured({
      model: MODELS.rewordDraft,
      system: render(opts.prompts.reword.system, { categories: CATEGORY_LIST }),
      user: render(opts.prompts.reword.user, {
        hook: c.rawClaim,
        article_title: c.article.title,
        evidence: c.contextText,
      }),
      schema: RewordDraftSchema,
      maxTokens: DRAFT_MAX_TOKENS,
      effort: opts.draftEffort ?? 'medium',
    });
    usage.push(draftCall.usage);
    opts.budget.add(draftCall.usage);
    if (!draftCall.ok) {
      reject(c, 'draft', [draftCall.reason], draftCall.detail ? [draftCall.detail] : [], usage);
      continue;
    }
    const draft = draftCall.output;

    const failures = checkDraft(draft, c.contextText, c.rawClaim);
    if (failures.length) {
      reject(
        c,
        'checks',
        [...new Set(failures.map((f) => f.reason))],
        failures.map((f) => f.detail),
        usage,
        { draft },
      );
      continue;
    }

    const entailCall = await opts.llm.structured({
      model: MODELS.entailment,
      system: opts.prompts.entailment.system,
      user: render(opts.prompts.entailment.user, {
        article_title: c.article.title,
        evidence: c.contextText,
        statement: draft.text.trim(),
        expansion: draft.expansion.trim(),
      }),
      schema: EntailmentSchema,
      maxTokens: ENTAILMENT_MAX_TOKENS,
      effort: opts.entailmentEffort ?? 'high',
    });
    usage.push(entailCall.usage);
    opts.budget.add(entailCall.usage);
    if (!entailCall.ok) {
      reject(
        c,
        'entailment',
        [entailCall.reason],
        entailCall.detail ? [entailCall.detail] : [],
        usage,
        {
          draft,
        },
      );
      continue;
    }
    const { supported, unsupportedDetails } = entailCall.output;
    // Belt and braces: "supported" with listed problems is still a rejection.
    if (!supported || unsupportedDetails.length) {
      reject(
        c,
        'entailment',
        ['not-entailed'],
        unsupportedDetails.length ? unsupportedDetails : ['Marked unsupported'],
        usage,
        { draft },
      );
      continue;
    }

    accepted.push(
      RewordedTruthSchema.parse({
        candidateId: c.id,
        category: draft.category,
        text: draft.text.trim(),
        expansion: draft.expansion.trim(),
        source: c.article,
        supportingSentence: draft.supportingSentence.trim(),
        entities: draft.entities,
        scores: { surprise: draft.surprise, verifiability: draft.verifiability },
        entailment: { supported: true, unsupportedDetails: [] },
        usage,
        trace: trace(MODELS.entailment),
      }),
    );
  }

  stats.accepted = accepted.length;
  stats.spentUsd = opts.budget.spentUsd;
  return { accepted, rejected, stats };
}
