/**
 * A small, dependency-free secret scanner (docs/security.md).
 *
 * Two modes:
 *  - repo:   every tracked file, looking for credential *values*.
 *  - bundle: the built browser bundle, also flagging secret variable *names*,
 *            since a server env var name in client code means it was wired up wrong.
 *
 * A line containing `secret-scan: allow` is skipped, for docs that must show a
 * pattern. Use it sparingly, and never next to a real value.
 */

export interface Rule {
  id: string;
  description: string;
  pattern: RegExp;
}

export interface Finding {
  file: string;
  line: number;
  rule: string;
  /** The match with most of it masked, safe to print in CI logs. */
  preview: string;
}

/** Env var names that hold secrets. Their values are never committed and never reach the browser. */
export const SECRET_ENV_NAMES = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'SEARCH_API_KEY',
  'TAVILY_API_KEY',
  'DATABASE_URL',
] as const;

/** Placeholder passwords that docs and examples use in connection strings. */
const PLACEHOLDER_PASSWORD =
  /^(?:password|pass|secret|changeme|\*+|x+|<[^>]*>|\$\{[^}]*\}|\$[A-Z_]+)$/i;

export const VALUE_RULES: Rule[] = [
  {
    id: 'anthropic-key',
    description: 'Anthropic API key or OAuth token',
    pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g,
  },
  { id: 'tavily-key', description: 'Tavily API key', pattern: /tvly-[A-Za-z0-9_-]{20,}/g },
  {
    id: 'github-token',
    description: 'GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/g,
  },
  { id: 'aws-access-key', description: 'AWS access key ID', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    id: 'private-key',
    description: 'PEM private key',
    pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/g,
  },
  {
    id: 'database-url',
    description: 'Database URL with a password',
    pattern: /\bpostgres(?:ql)?:\/\/[^\s:@/'"`]+:([^\s@/'"`]+)@[^\s'"`]+/g,
  },
  {
    id: 'secret-env-assignment',
    description: 'A secret env var assigned a literal value',
    pattern: new RegExp(
      // [ \\t] not \\s: with the m flag, \\s would run on into the next line.
      `^[ \\t]*(?:export[ \\t]+)?(?:${SECRET_ENV_NAMES.join('|')})[ \\t]*=[ \\t]*['"]?([^\\s'"#$][^\\s'"#]{7,})`,
      'gm',
    ),
  },
];

const ALLOW_MARKER = 'secret-scan: allow';

function mask(match: string): string {
  return match.length <= 10 ? '****' : `${match.slice(0, 8)}…(${match.length} chars)`;
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function allowed(text: string, index: number): boolean {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end === -1 ? undefined : end).includes(ALLOW_MARKER);
}

export interface ScanOptions {
  /** Also flag secret env var names (bundle mode). */
  flagSecretNames?: boolean;
}

export function scanText(text: string, file: string, options: ScanOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const rules = [...VALUE_RULES];
  if (options.flagSecretNames) {
    rules.push({
      id: 'secret-env-name',
      description: 'Secret env var name in client code',
      pattern: new RegExp(`\\b(?:${SECRET_ENV_NAMES.join('|')})\\b`, 'g'),
    });
  }
  for (const rule of rules) {
    for (const m of text.matchAll(rule.pattern)) {
      const index = m.index;
      if (rule.id === 'database-url' && PLACEHOLDER_PASSWORD.test(m[1] ?? '')) continue;
      if (allowed(text, index)) continue;
      findings.push({ file, line: lineOf(text, index), rule: rule.id, preview: mask(m[0]) });
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

/** Binary files (a NUL byte in the first 8 KB) are skipped. */
export function looksBinary(buf: Uint8Array): boolean {
  return buf.subarray(0, 8192).includes(0);
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Scan file contents; skips binaries and very large files. */
export function scanBuffer(buf: Uint8Array, file: string, options: ScanOptions = {}): Finding[] {
  if (buf.byteLength > MAX_FILE_BYTES || looksBinary(buf)) return [];
  return scanText(new TextDecoder().decode(buf), file, options);
}

export function formatFinding(f: Finding): string {
  return `${f.file}:${f.line}  ${f.rule}  ${f.preview}`;
}
