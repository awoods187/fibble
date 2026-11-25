import { HEDGING_PATTERN } from '../reword/checks';
import type { HeuristicFlag } from './schemas';

/**
 * Cheap tells that a lie stands out from its round (PRD section 5, stage 5). They're
 * recorded for the reviewer and break ties; the spotter is the main test.
 */

/** A lie more than this far from the truths' average length stands out. */
export const LENGTH_OUTLIER = 0.2;

const hasDigit = (s: string) => /\d/.test(s);
const hasQuote = (s: string) => /["“”]/.test(s);

export function heuristicFlags(lie: string, truths: [string, string]): HeuristicFlag[] {
  const flags: HeuristicFlag[] = [];
  const avg = (truths[0].length + truths[1].length) / 2;
  if (Math.abs(lie.length - avg) > avg * LENGTH_OUTLIER) flags.push('length-outlier');
  const truthDigits = truths.filter(hasDigit).length;
  // A number in the lie and neither truth, or in both truths and not the lie.
  if ((hasDigit(lie) && truthDigits === 0) || (!hasDigit(lie) && truthDigits === 2)) {
    flags.push('number-mismatch');
  }
  if (hasQuote(lie) && !truths.some(hasQuote)) flags.push('quote-only-in-lie');
  if (lie.includes('!')) flags.push('exclamation');
  if (HEDGING_PATTERN.test(lie)) flags.push('hedging');
  return flags;
}
