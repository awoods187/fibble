import { createHash } from 'node:crypto';
import { type Round, RoundSchema } from '@fibble/shared';
import type { CandidateRound } from '../assemble/schemas';
import type { LieCandidate } from '../generate/schemas';
import {
  type ApprovedRound,
  ApprovedRoundSchema,
  type ReviewDecisions,
  type ReviewItem,
  ReviewItemSchema,
  type ReviewLog,
  ReviewLogSchema,
} from './schemas';

export const roundIdFor = (truthIds: [string, string]) =>
  `round-${createHash('sha256').update(truthIds.join('|')).digest('hex').slice(0, 12)}`;

export const reviewSetIdFor = (roundIds: string[]) =>
  `review-${createHash('sha256').update(roundIds.join('|')).digest('hex').slice(0, 10)}`;

/** What the reviewer sees: truths with their reveal, the chosen lie, and the alternates. */
export function buildReviewItems(rounds: CandidateRound[], lies: LieCandidate[]): ReviewItem[] {
  const lieById = new Map(lies.map((l) => [l.id, l]));
  return rounds.map((r) => {
    const truths = r.round.statements
      .filter((_, i) => i !== r.round.lieIndex)
      .map((s) => ({
        text: s.text,
        expansion: s.expansion ?? '',
        sourceTitle: s.source?.title ?? '',
        sourceUrl: s.source?.url ?? '',
      }));
    const chosen = {
      lieId: r.lieId,
      text: r.round.statements[r.round.lieIndex]?.text ?? '',
      lieNote: r.round.lieNote,
      plausibility: r.plausibility,
      spotterDetectionRate: r.spotterDetectionRate,
    };
    const alternates = r.alternates.flatMap((a) => {
      const lie = lieById.get(a.lieId);
      return lie
        ? [
            {
              lieId: a.lieId,
              text: a.text,
              lieNote: lie.lieNote,
              plausibility: a.plausibility,
              spotterDetectionRate: a.spotterDetectionRate,
            },
          ]
        : [];
    });
    return ReviewItemSchema.parse({
      roundId: roundIdFor(r.truthIds),
      category: r.round.category,
      truths,
      lies: [chosen, ...alternates],
      heuristicFlags: r.heuristicFlags,
    });
  });
}

/** The round with a different lie in the same position, and that lie's note. */
export function withLie(round: Round, text: string, lieNote: string): Round {
  const statements = round.statements.map((s, i) => (i === round.lieIndex ? { text } : s));
  return RoundSchema.parse({ ...round, statements, lieNote });
}

export interface ApplyResult {
  approved: ApprovedRound[];
  log: ReviewLog;
}

/**
 * Turn the page's decisions into approved rounds and a review-log entry. A decision must
 * name a round from this set, and an approval must name one of that round's lies.
 */
export function applyDecisions(
  rounds: CandidateRound[],
  lies: LieCandidate[],
  decisions: ReviewDecisions,
  reviewedBy: string,
): ApplyResult {
  const items = buildReviewItems(rounds, lies);
  const setId = reviewSetIdFor(items.map((i) => i.roundId));
  if (decisions.setId !== setId) {
    throw new Error(`These decisions are for review set ${decisions.setId}, not ${setId}`);
  }
  const byId = new Map(rounds.map((r) => [roundIdFor(r.truthIds), r]));
  const itemById = new Map(items.map((i) => [i.roundId, i]));
  const approved: ApprovedRound[] = [];
  const logDecisions: ReviewLog['decisions'] = [];

  for (const d of decisions.decisions) {
    const r = byId.get(d.roundId);
    const item = itemById.get(d.roundId);
    if (!r || !item) throw new Error(`Unknown round in decisions: ${d.roundId}`);
    const base = {
      roundId: d.roundId,
      category: r.round.category,
      truthIds: r.truthIds,
      promptVersion: r.trace.promptVersion,
      note: d.note,
    };
    if (d.decision === 'rejected') {
      logDecisions.push({
        ...base,
        decision: 'rejected',
        reason: d.reason,
        usedAlternateLie: false,
      });
      continue;
    }
    const lie = item.lies.find((l) => l.lieId === d.lieId);
    if (!lie) throw new Error(`Round ${d.roundId} has no lie ${d.lieId}`);
    const usedAlternateLie = lie.lieId !== r.lieId;
    const round = usedAlternateLie ? withLie(r.round, lie.text, lie.lieNote) : r.round;
    approved.push(
      ApprovedRoundSchema.parse({
        roundId: d.roundId,
        round,
        truthIds: r.truthIds,
        lieId: lie.lieId,
        sourceTitles: item.truths.map((t) => t.sourceTitle),
        reviewSetId: setId,
        reviewedBy,
        reviewedAt: decisions.decidedAt,
      }),
    );
    logDecisions.push({ ...base, decision: 'approved', lieId: lie.lieId, usedAlternateLie });
  }

  const decided = new Set(decisions.decisions.map((d) => d.roundId));
  const log = ReviewLogSchema.parse({
    reviewSetId: setId,
    reviewedBy,
    reviewedAt: decisions.decidedAt,
    counts: {
      approved: approved.length,
      rejected: logDecisions.filter((d) => d.decision === 'rejected').length,
      undecided: items.filter((i) => !decided.has(i.roundId)).length,
    },
    decisions: logDecisions,
  });
  return { approved, log };
}
