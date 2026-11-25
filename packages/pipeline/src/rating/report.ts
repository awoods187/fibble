import { MIN_PLAUSIBILITY } from '../verify/schemas';
import type { RatingKeyEntry, RatingsFile } from './page';

/**
 * Compare human believability ratings with the model's (ADR 0008). Two questions:
 *  1. Do humans find the lies as believable as the truths? If so, the lies are good
 *     and a rater that scores them much lower is miscalibrated.
 *  2. Where both rated a lie, how often do they agree on passing the 3+ floor?
 * Ratings marked "knew" are excluded from both: they aren't blind judgments.
 */

export interface GroupStats {
  n: number;
  mean: number;
  /** Count per score, 1 to 5. */
  dist: Record<number, number>;
  /** Share at or above the pass floor. */
  passRate: number;
}

export interface LieComparison {
  sourceId: string;
  human: number;
  model: number;
}

export interface RatingReport {
  setId: string;
  rated: number;
  knewExcluded: number;
  truths: GroupStats;
  lies: GroupStats;
  /** Lies rated by both a human and the model, blind ratings only. */
  compared: number;
  /** Mean of (model - human): negative means the model is harsher. */
  meanModelMinusHuman: number;
  bothPass: number;
  humanOnlyPass: number;
  modelOnlyPass: number;
  neitherPass: number;
  rows: LieComparison[];
}

function stats(scores: number[]): GroupStats {
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const s of scores) dist[s] = (dist[s] ?? 0) + 1;
  const n = scores.length;
  return {
    n,
    mean: n ? scores.reduce((a, b) => a + b, 0) / n : 0,
    dist,
    passRate: n ? scores.filter((s) => s >= MIN_PLAUSIBILITY).length / n : 0,
  };
}

export function ratingReport(
  key: Record<string, RatingKeyEntry>,
  ratings: RatingsFile,
  /** Model plausibility by lie id (the `sourceId` in the key). */
  model: Map<string, number>,
): RatingReport {
  const truthScores: number[] = [];
  const lieScores: number[] = [];
  const rows: LieComparison[] = [];
  let knewExcluded = 0;
  for (const r of ratings.ratings) {
    const entry = key[r.id];
    if (!entry) continue;
    if (r.knew) {
      knewExcluded++;
      continue;
    }
    if (entry.expected === 'truth') truthScores.push(r.plausibility);
    else {
      lieScores.push(r.plausibility);
      const m = model.get(entry.sourceId);
      if (m !== undefined) rows.push({ sourceId: entry.sourceId, human: r.plausibility, model: m });
    }
  }
  const pass = (x: number) => x >= MIN_PLAUSIBILITY;
  return {
    setId: ratings.setId,
    rated: ratings.ratings.length,
    knewExcluded,
    truths: stats(truthScores),
    lies: stats(lieScores),
    compared: rows.length,
    meanModelMinusHuman: rows.length
      ? rows.reduce((n, r) => n + (r.model - r.human), 0) / rows.length
      : 0,
    bothPass: rows.filter((r) => pass(r.human) && pass(r.model)).length,
    humanOnlyPass: rows.filter((r) => pass(r.human) && !pass(r.model)).length,
    modelOnlyPass: rows.filter((r) => !pass(r.human) && pass(r.model)).length,
    neitherPass: rows.filter((r) => !pass(r.human) && !pass(r.model)).length,
    rows,
  };
}
