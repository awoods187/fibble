import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateContentDir } from './validate-content';

const EXAMPLE_DIR = resolve(import.meta.dirname, '../../../content-example');

describe('validateContentDir', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fibble-content-'));
    await cp(EXAMPLE_DIR, dir, { recursive: true });
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('passes the shipped content-example days', async () => {
    const { files, issues } = await validateContentDir(EXAMPLE_DIR, { requireSample: true });
    expect(issues).toEqual([]);
    expect(files).toHaveLength(3);
  });

  it('reports a schema violation with its path', async () => {
    const file = join(dir, '2026-11-24.json');
    const puzzle = JSON.parse(await readFile(file, 'utf8'));
    puzzle.rounds[0].statements[0].text = 'too short';
    await writeFile(file, JSON.stringify(puzzle));
    const { issues } = await validateContentDir(dir);
    expect(issues).toContainEqual({
      file: '2026-11-24.json',
      message: expect.stringMatching(/^rounds\.0\.statements\.0\.text:/),
    });
  });

  it('reports a date that does not match the file name', async () => {
    const file = join(dir, '2026-11-24.json');
    const puzzle = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(join(dir, '2026-12-01.json'), JSON.stringify({ ...puzzle, puzzleNumber: 99 }));
    const { issues } = await validateContentDir(dir);
    expect(issues.map((i) => i.message)).toContain(
      'date "2026-11-24" does not match the file name',
    );
  });

  it('requires the sample flag when asked', async () => {
    const file = join(dir, '2026-11-25.json');
    const { sample: _sample, ...puzzle } = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(file, JSON.stringify(puzzle));
    const { issues } = await validateContentDir(dir, { requireSample: true });
    expect(issues).toEqual([
      { file: '2026-11-25.json', message: 'Example content must set "sample": true' },
    ]);
  });

  it('reports invalid JSON and bad file names', async () => {
    await writeFile(join(dir, '2026-11-27.json'), '{ nope');
    await writeFile(join(dir, 'today.json'), '{}');
    const { issues } = await validateContentDir(dir);
    expect(issues.map((i) => i.file)).toEqual(['2026-11-27.json', 'today.json']);
  });
});
