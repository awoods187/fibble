import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gitRoot, scanSource } from './sources';

const REPO = resolve(import.meta.dirname, '../../..');
const j = (...parts: string[]) => parts.join('');

function ignored(path: string): boolean {
  try {
    execFileSync('git', ['-C', REPO, 'check-ignore', '-q', '--no-index', path]);
    return true;
  } catch {
    return false;
  }
}

describe('this repo', () => {
  it('contains no secrets in any committable file', async () => {
    const { files, findings } = await scanSource({ kind: 'repo', root: REPO });
    expect(files).toBeGreaterThan(50);
    expect(findings).toEqual([]);
  });

  it.each([
    '.env',
    '.env.local',
    '.env.production',
    '.env.development.local',
    'apps/web/.env.local',
    'packages/pipeline/.env',
  ])('git-ignores %s', (path) => {
    expect(ignored(path)).toBe(true);
  });

  it('keeps .env.example committable', () => {
    expect(ignored('.env.example')).toBe(false);
  });

  it('has only empty values in .env.example', async () => {
    const lines = (await readFile(join(REPO, '.env.example'), 'utf8')).split('\n');
    const assignments = lines.filter((l) => /^\s*[A-Z][A-Z0-9_]*\s*=/.test(l));
    expect(assignments.length).toBeGreaterThan(0);
    for (const line of assignments) expect(line).toMatch(/^\s*[A-Z][A-Z0-9_]*\s*=\s*$/);
  });

  it('never sets ANTHROPIC_API_KEY, which would override the keyless login', async () => {
    const text = await readFile(join(REPO, '.env.example'), 'utf8');
    expect(text).not.toMatch(/^\s*ANTHROPIC_API_KEY\s*=/m);
  });
});

describe('scanSource on a scratch repo', () => {
  let dir: string;
  const run = (...args: string[]) => execFileSync('git', ['-C', dir, ...args]);
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fibble-scan-'));
    run('init', '-q');
    await writeFile(join(dir, '.gitignore'), '.env.local\n');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('scans untracked files but not git-ignored ones', async () => {
    const key = j('tvly', '-', 'X'.repeat(30));
    await writeFile(join(dir, '.env.local'), `SEARCH_API_KEY=${key}\n`);
    await writeFile(join(dir, 'notes.md'), `key: ${key}\n`);
    const { findings } = await scanSource({ kind: 'repo', root: dir });
    expect(findings.map((f) => f.file)).toEqual(['notes.md']);
  });

  it('in staged mode, scans the staged content rather than the working copy', async () => {
    const key = j('sk-', 'ant-', 'Z'.repeat(30));
    await writeFile(join(dir, 'a.ts'), `export const k = '${key}';\n`);
    run('add', 'a.ts');
    await writeFile(join(dir, 'a.ts'), 'export const k = process.env.X;\n');
    const staged = await scanSource({ kind: 'staged', root: dir });
    expect(staged.findings.map((f) => f.rule)).toEqual(['anthropic-key']);
    const repo = await scanSource({ kind: 'repo', root: dir });
    expect(repo.findings).toEqual([]);
  });

  it('scans a directory with secret names flagged, labelled by path', async () => {
    await writeFile(join(dir, 'chunk.js'), 'const a=process.env.DATABASE_URL;');
    const { findings } = await scanSource(
      { kind: 'dir', dir, label: 'bundle' },
      { flagSecretNames: true },
    );
    expect(findings).toEqual([
      expect.objectContaining({ file: join('bundle', 'chunk.js'), rule: 'secret-env-name' }),
    ]);
  });

  it('finds the git root from a subfolder', () => {
    expect(gitRoot(join(REPO, 'tools/security'))).toBe(REPO);
  });
});
