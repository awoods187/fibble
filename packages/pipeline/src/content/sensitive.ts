/**
 * Hard content filter (ADR 0010): topics Fibble never uses, whatever a model thinks.
 *
 * Model flags missed a truth about a school's Nazi-themed parade, so this is a
 * code-level safety net that doesn't depend on a model noticing. It is applied to the
 * hook before any money is spent, then to every statement, reveal, lie and lie note,
 * and to anything put in front of a human rater.
 *
 * It is deliberately broad: a false positive costs one candidate, while a false negative
 * puts something hurtful in front of players. Add terms here when a review finds a miss.
 */

export type SensitiveTopic = 'extremism' | 'atrocity' | 'racism';

export interface SensitiveMatch {
  topic: SensitiveTopic;
  match: string;
}

const PATTERNS: [SensitiveTopic, RegExp][] = [
  [
    'extremism',
    /\b(?:neo-?)?nazi(?:s|sm|fied)?\b|\bhitler\w*|\bthird reich\b|\bswastikas?\b|\bgestapo\b|\bwaffen\b|\bfascis(?:m|ts?)\b|\bku klux klan\b|\bkkk\b|\bwhite supremac\w*|\bhate groups?\b|\bneo-?confederate\w*/gi,
  ],
  [
    'atrocity',
    /\bholocaust\b|\bgenocid\w*|\bethnic cleansing\b|\bmassacr\w*|\bpogroms?\b|\b(?:concentration|death|extermination) camps?\b|\bwar crimes?\b|\batrocit(?:y|ies)\b|\bterroris[mt]s?\b|\bterror(?:ist)? attacks?\b/gi,
  ],
  [
    'racism',
    /\b(?:anti-?)?racis[mt]s?\b|\bracial(?:ly)? segregat\w*|\bsegregation\w*|\bapartheid\b|\bjim crow\b|\bslaver(?:y|s)\b|\bslaves?\b|\benslave\w*|\bslave trade\b|\blynch\w*|\bblackface\b|\beugenic\w*/gi,
  ],
];

/** Every sensitive term found in the texts, de-duplicated. */
export function findSensitive(...texts: string[]): SensitiveMatch[] {
  const found = new Map<string, SensitiveMatch>();
  for (const text of texts) {
    for (const [topic, pattern] of PATTERNS) {
      for (const m of text.matchAll(pattern)) {
        const match = m[0].toLowerCase();
        found.set(`${topic}:${match}`, { topic, match });
      }
    }
  }
  return [...found.values()];
}

export function describeSensitive(matches: SensitiveMatch[]): string {
  return `Sensitive topic: ${matches.map((m) => `${m.topic} ("${m.match}")`).join(', ')}`;
}
