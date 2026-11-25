import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { type Finding, MAX_FILE_BYTES, scanBuffer, type ScanOptions } from './scan';

/** Where the bytes to scan come from. */
export type Source =
  /** Tracked files plus untracked files git doesn't ignore: what could be committed. */
  | { kind: 'repo'; root: string }
  /** The staged version of each staged file: what this commit would contain. */
  | { kind: 'staged'; root: string }
  /** Every file under a directory, e.g. the built client bundle. */
  | { kind: 'dir'; dir: string; label: string };

function git(root: string, args: string[]): Buffer {
  return execFileSync('git', ['-C', root, ...args], { maxBuffer: 256 * 1024 * 1024 });
}

function nulList(buf: Buffer): string[] {
  return buf.toString('utf8').split('\0').filter(Boolean);
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

export async function scanSource(
  source: Source,
  options: ScanOptions = {},
): Promise<{
  files: number;
  findings: Finding[];
}> {
  const findings: Finding[] = [];
  let files = 0;

  if (source.kind === 'dir') {
    for (const path of await walk(source.dir)) {
      files++;
      const name = join(source.label, relative(source.dir, path));
      findings.push(...scanBuffer(await readFile(path), name, options));
    }
    return { files, findings };
  }

  const names =
    source.kind === 'repo'
      ? nulList(git(source.root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']))
      : nulList(git(source.root, ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']));

  for (const name of names) {
    let buf: Buffer;
    if (source.kind === 'staged') {
      buf = git(source.root, ['show', `:${name}`]);
    } else {
      // A tracked file deleted in the working tree has nothing left to scan.
      const read = await readFile(join(source.root, name)).catch(() => undefined);
      if (!read) continue;
      buf = read;
    }
    files++;
    if (buf.byteLength <= MAX_FILE_BYTES) findings.push(...scanBuffer(buf, name, options));
  }
  return { files, findings };
}

/** The git top-level folder containing `dir`. */
export function gitRoot(dir: string): string {
  return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
}
