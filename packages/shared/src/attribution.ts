import type { Source } from './schema';

/**
 * Wikipedia attribution links (PRD section 5, "Licensing and attribution"): each truth credits
 * its article, and the article's history credits its authors. Links stay on the article's own
 * Wikipedia host (we only use en.wikipedia.org today).
 */

export const CC_BY_SA_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

const origin = (s: Source) => new URL(s.url).origin;
const titleParam = (title: string) => encodeURIComponent(title.replace(/ /g, '_'));

/** The article's edit history, which lists its authors. */
export function articleHistoryUrl(s: Source): string {
  return `${origin(s)}/w/index.php?title=${titleParam(s.title)}&action=history`;
}

/** The exact revision the fact was checked against. */
export function revisionUrl(s: Source): string {
  return `${origin(s)}/w/index.php?title=${titleParam(s.title)}&oldid=${s.revisionId}`;
}
