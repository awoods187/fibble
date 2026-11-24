import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PuzzleSchema } from '@fibble/shared';

export interface ValidationIssue {
  file: string;
  message: string;
}

export interface ValidateOptions {
  /** Require `"sample": true` on every file (used for content-example/). */
  requireSample?: boolean;
}

const FILE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;

/** Validate every YYYY-MM-DD.json file in `dir` against the shared Puzzle schema. */
export async function validateContentDir(
  dir: string,
  { requireSample = false }: ValidateOptions = {},
): Promise<{ files: string[]; issues: ValidationIssue[] }> {
  const entries = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const issues: ValidationIssue[] = [];
  const numbers = new Map<number, string>();

  for (const file of entries) {
    if (!FILE_RE.test(file)) {
      issues.push({ file, message: 'File name must be YYYY-MM-DD.json' });
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(await readFile(join(dir, file), 'utf8'));
    } catch (err) {
      issues.push({ file, message: `Invalid JSON: ${(err as Error).message}` });
      continue;
    }
    const result = PuzzleSchema.safeParse(data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({ file, message: `${issue.path.join('.') || '(root)'}: ${issue.message}` });
      }
      continue;
    }
    const puzzle = result.data;
    if (`${puzzle.date}.json` !== file) {
      issues.push({ file, message: `date "${puzzle.date}" does not match the file name` });
    }
    if (requireSample && puzzle.sample !== true) {
      issues.push({ file, message: 'Example content must set "sample": true' });
    }
    const clash = numbers.get(puzzle.puzzleNumber);
    if (clash) {
      issues.push({
        file,
        message: `puzzleNumber ${puzzle.puzzleNumber} is also used by ${clash}`,
      });
    }
    numbers.set(puzzle.puzzleNumber, file);
  }

  if (entries.length === 0) issues.push({ file: dir, message: 'No puzzle files found' });
  return { files: entries, issues };
}
