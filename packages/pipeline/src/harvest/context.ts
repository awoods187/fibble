/**
 * Pick the evidence text for a candidate: the article's lead plus the one
 * section whose words best match the hook. Input is a plain-text extract
 * with "== Heading ==" lines (TextExtracts, exsectionformat=wiki).
 */

export interface Section {
  heading: string;
  text: string;
}

export interface ArticleSections {
  lead: string;
  sections: Section[];
}

const HEADING = /^(={2,6})\s*(.*?)\s*\1\s*$/;

/** Sections that hold citations or navigation, never evidence. */
const SKIP_SECTIONS = new Set([
  'references',
  'notes',
  'citations',
  'sources',
  'bibliography',
  'further reading',
  'external links',
  'see also',
  'notes and references',
  'footnotes',
]);

export function splitSections(extract: string): ArticleSections {
  const lead: string[] = [];
  const sections: Section[] = [];
  let current: { heading: string; lines: string[] } | undefined;
  const flush = () => {
    if (current) sections.push({ heading: current.heading, text: current.lines.join('\n').trim() });
  };
  for (const line of extract.split('\n')) {
    const m = HEADING.exec(line);
    if (m) {
      flush();
      current = { heading: m[2] ?? '', lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      lead.push(line);
    }
  }
  flush();
  return {
    lead: lead.join('\n').trim(),
    sections: sections.filter((s) => s.text && !SKIP_SECTIONS.has(s.heading.toLowerCase())),
  };
}

const STOPWORDS = new Set([
  'that',
  'this',
  'with',
  'from',
  'have',
  'were',
  'which',
  'their',
  'there',
  'about',
  'after',
  'before',
  'during',
  'would',
  'could',
  'being',
  'been',
  'into',
  'than',
  'them',
  'they',
  'when',
  'what',
  'while',
  'also',
  'only',
  'some',
  'other',
]);

/** Lower-case content words of 4+ letters, used to match a hook to a section. */
export function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  return new Set(words.filter((w) => !STOPWORDS.has(w)));
}

/** The section sharing the most content words with the hook; ties go to the earlier section. */
export function bestSection(sections: Section[], hook: string): Section | undefined {
  const hookWords = contentWords(hook);
  let best: Section | undefined;
  let bestScore = 0;
  for (const section of sections) {
    const words = contentWords(`${section.heading} ${section.text}`);
    let score = 0;
    for (const w of hookWords) if (words.has(w)) score++;
    if (score > bestScore) {
      best = section;
      bestScore = score;
    }
  }
  return best;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastStop = cut.lastIndexOf('. ');
  return (lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut).trimEnd() + ' …';
}

export const CONTEXT_LIMITS = { lead: 2500, section: 5000 } as const;

/** Lead plus best-matching section, each clipped, as one evidence string. */
export function buildContext(extract: string, hook: string): string {
  const { lead, sections } = splitSections(extract);
  const parts: string[] = [];
  if (lead) parts.push(clip(lead, CONTEXT_LIMITS.lead));
  const section = bestSection(sections, hook);
  if (section)
    parts.push(`== ${section.heading} ==\n${clip(section.text, CONTEXT_LIMITS.section)}`);
  return parts.join('\n\n');
}

/**
 * A short evidence passage for verification: the start of the lead plus the
 * section that best matches `text`. Facts in a DYK-style claim often live deep
 * in an article, where an introduction-only snippet would miss them.
 */
export function evidencePassage(
  extract: string,
  text: string,
  max = { lead: 600, section: 1800 },
): string {
  const { lead, sections } = splitSections(extract);
  const parts: string[] = [];
  if (lead) parts.push(clip(lead, max.lead));
  const section = bestSection(sections, text);
  if (section) parts.push(`== ${section.heading} ==\n${clip(section.text, max.section)}`);
  return parts.join('\n\n');
}
