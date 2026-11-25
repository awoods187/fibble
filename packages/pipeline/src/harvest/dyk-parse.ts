/**
 * Pure helpers for reading Wikipedia "Did you know..." (DYK) archive pages.
 * Archive pages are wikitext; each hook is one bullet line like
 *   * ... that '''[[Subject]]''' ''(pictured)'' did something odd?
 * The bolded link is the hook's subject article.
 */

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** "2024-05" -> "Wikipedia:Did you know archive/2024/May". */
export function dykArchiveTitle(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const name = match ? MONTH_NAMES[Number(match[2]) - 1] : undefined;
  if (!match || !name) throw new Error(`Invalid month "${month}", expected YYYY-MM`);
  return `Wikipedia:Did you know archive/${match[1]}/${name}`;
}

export interface ParsedHook {
  /** Plain-text hook, e.g. "... that Galileo's middle finger is considered a secular relic?" */
  text: string;
  /** Bolded link targets: the hook's subject article(s), in order. */
  subjects: string[];
  /** Every article link target in the hook, subjects included, de-duplicated. */
  links: string[];
}

const HOOK_LINE = /^\*\s*\.\.\.\s*that\b/;
const LINK = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
const BOLD_LINK = /'''+\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
/** Namespaced links (files, categories, interwiki) are not article references. */
const NON_ARTICLE =
  /^:?\s*(?:file|image|media|category|template|help|portal|special|wikipedia|wikt|wiktionary|commons|wikisource|species|meta|[sdwm])\s*:/i;
/** File, image and category links render as pictures or nothing, never as hook text. */
const HIDDEN_LINK = /\[\[\s*(?:file|image|media|category)\s*:[^\]]*\]\]/gi;

/** Normalise a link target the way MediaWiki does: no #fragment, spaces, first letter upper-case. */
export function normalizeTitle(target: string): string {
  const base = target.split('#')[0]?.replace(/_/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
  const title = base.startsWith(':') ? base.slice(1).trim() : base;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function linkTargets(line: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(pattern)) {
    const raw = m[1];
    if (raw === undefined || NON_ARTICLE.test(raw.trim())) continue;
    const title = normalizeTitle(raw);
    if (title && !out.includes(title)) out.push(title);
  }
  return out;
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&amp;': '&',
  '&quot;': '"',
  '&minus;': '−',
};

/** Convert one line of hook wikitext to plain text. */
export function wikitextToPlain(wikitext: string): string {
  let s = wikitext.replace(/^\*\s*/, '');
  s = s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // {{-?}} renders a question mark after a title that ends in punctuation.
  s = s.replace(/\{\{\s*-\?\s*\}\}/g, '?');
  // Strip remaining templates, innermost first, so nested ones go too.
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\{\{[^{}]*\}\}/g, '');
  } while (s !== prev);
  s = s.replace(HIDDEN_LINK, '');
  s = s.replace(/\[\[(?:[^\]|]+\|)?([^\]]*)\]\]/g, '$1');
  s = s.replace(/'{2,}/g, '');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&[a-z]+;/g, (e) => ENTITIES[e] ?? e);
  // Image notes: (pictured), (left), (pictured, right) ...
  s = s.replace(/\s*\((?:pictured|left|right|center|centre|top|bottom|above|below)\b[^)]*\)/gi, '');
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([?,.;:])/g, '$1')
    .trim();
}

/** Extract every hook from a DYK archive page's wikitext. */
export function parseDykArchive(wikitext: string): ParsedHook[] {
  const hooks: ParsedHook[] = [];
  const seen = new Set<string>();
  for (const line of wikitext.split('\n')) {
    if (!HOOK_LINE.test(line)) continue;
    const text = wikitextToPlain(line);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    hooks.push({ text, subjects: linkTargets(line, BOLD_LINK), links: linkTargets(line, LINK) });
  }
  return hooks;
}
