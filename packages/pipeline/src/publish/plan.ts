import { isDateReleased, type Puzzle, PuzzleSchema } from '@fibble/shared';
import { describeSensitive, findSensitive } from '../content/sensitive';

/**
 * What the nightly publish job does (ADR 0012): for each date from today through
 * today + (days - 1), compare the bank file with what's stored and decide one action.
 * Pure, so every rule is unit-tested; scripts/publish-days.ts carries it out.
 */

export type PublishAction =
  | { date: string; action: 'insert' | 'update'; puzzle: Puzzle }
  | { date: string; action: 'unchanged' | 'stored-only' }
  /** A live day differs from the bank. Live days are never changed here (kill switch later). */
  | { date: string; action: 'blocked-live'; reason: string }
  /** No bank file and nothing stored: players get no puzzle that day. */
  | { date: string; action: 'missing'; reason: string }
  /** The bank file fails a check. Any invalid day stops the whole run. */
  | { date: string; action: 'invalid'; reason: string };

export interface PlanInput {
  /** Raw JSON from bank/YYYY-MM-DD.json, keyed by the file's date. */
  bank: Map<string, unknown>;
  /** What's already in the database, keyed by date. */
  stored: Map<string, unknown>;
  now: Date;
  days: number;
  allowSample?: boolean;
}

export const DEFAULT_PUBLISH_DAYS = 4;

/** YYYY-MM-DD for a date `offset` days after `now`'s UTC date. */
export function utcDay(now: Date, offset = 0): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
  return d.toISOString().slice(0, 10);
}

/** JSON with object keys sorted at every level: equal content gives equal text (jsonb reorders keys). */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

/** Every player-visible text in a puzzle, for the content filter. */
export function puzzleTexts(p: Puzzle): string[] {
  return p.rounds.flatMap((r) => [
    r.lieNote,
    ...r.statements.flatMap((s) => [s.text, ...(s.expansion ? [s.expansion] : [])]),
  ]);
}

/** The checks every published day must pass: schema, date, no samples, no banned topics. */
export function checkDay(
  date: string,
  raw: unknown,
  allowSample: boolean,
): { ok: true; puzzle: Puzzle } | { ok: false; reason: string } {
  const parsed = PuzzleSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      reason: `fails the puzzle schema: ${parsed.error.issues[0]?.message ?? ''}`,
    };
  const puzzle = parsed.data;
  if (puzzle.date !== date)
    return { ok: false, reason: `file is for ${date} but the puzzle says ${puzzle.date}` };
  if (puzzle.sample && !allowSample)
    return { ok: false, reason: 'sample content ("sample": true) is never published' };
  const sensitive = findSensitive(...puzzleTexts(puzzle));
  if (sensitive.length) return { ok: false, reason: describeSensitive(sensitive) };
  return { ok: true, puzzle };
}

export function planPublish(input: PlanInput): PublishAction[] {
  const actions: PublishAction[] = [];
  for (let i = 0; i < input.days; i++) {
    const date = utcDay(input.now, i);
    const raw = input.bank.get(date);
    const stored = input.stored.get(date);
    if (raw === undefined) {
      actions.push(
        stored === undefined
          ? { date, action: 'missing', reason: 'no bank file and nothing published' }
          : { date, action: 'stored-only' },
      );
      continue;
    }
    const check = checkDay(date, raw, input.allowSample ?? false);
    if (!check.ok) {
      actions.push({ date, action: 'invalid', reason: check.reason });
      continue;
    }
    if (stored === undefined) {
      actions.push({ date, action: 'insert', puzzle: check.puzzle });
    } else if (canonical(stored) === canonical(check.puzzle)) {
      actions.push({ date, action: 'unchanged' });
    } else if (isDateReleased(date, input.now)) {
      actions.push({
        date,
        action: 'blocked-live',
        reason: 'live day differs from the bank; use the kill switch',
      });
    } else {
      actions.push({ date, action: 'update', puzzle: check.puzzle });
    }
  }
  return actions;
}

/** Whether a plan may run: no invalid day. Missing days are warnings, not blockers. */
export function canPublish(actions: PublishAction[]): boolean {
  return !actions.some((a) => a.action === 'invalid');
}
