/**
 * Date gating. A puzzle date is released once that calendar day has started
 * anywhere on Earth, i.e. at 00:00 in UTC+14 (Kiribati, Line Islands).
 * See PRD section 3 ("Reset") and section 6 ("API surface").
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Earliest time zone on Earth, in hours ahead of UTC. */
export const EARLIEST_UTC_OFFSET_HOURS = 14;
/** Latest time zone on Earth, in hours behind UTC. */
export const LATEST_UTC_OFFSET_HOURS = 12;

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isValidDateString(date: string): boolean {
  const m = DATE_RE.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** Milliseconds since epoch for 00:00 UTC on the given date. Throws on bad input. */
export function utcMidnight(date: string): number {
  if (!isValidDateString(date)) throw new RangeError(`Invalid puzzle date: ${date}`);
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, mo - 1, d);
}

/** True only once `date` has started in UTC+14. */
export function isDateReleased(date: string, now: Date): boolean {
  return now.getTime() >= utcMidnight(date) - EARLIEST_UTC_OFFSET_HOURS * HOUR_MS;
}

/**
 * True once `date` is "more than 1 day old": it ended everywhere on Earth
 * (end of day in UTC-12) more than 24 hours ago. Archived dates are refused
 * by the API unless archive access is on (PRD section 6).
 */
export function isDateArchived(date: string, now: Date): boolean {
  const endEverywhere = utcMidnight(date) + DAY_MS + LATEST_UTC_OFFSET_HOURS * HOUR_MS;
  return now.getTime() >= endEverywhere + DAY_MS;
}

/** Puzzle number: launch day is Fibble #1. Throws for dates before launch. */
export function puzzleNumber(date: string, launchDate: string): number {
  const days = Math.round((utcMidnight(date) - utcMidnight(launchDate)) / DAY_MS);
  if (days < 0) throw new RangeError(`${date} is before launch date ${launchDate}`);
  return days + 1;
}

/** The current calendar date in UTC as YYYY-MM-DD. */
export function utcDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}
