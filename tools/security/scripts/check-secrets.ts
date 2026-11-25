/**
 * Fail if any secret is about to be committed, or has reached the browser bundle.
 *
 *   pnpm check:secrets                                # repo: tracked + untracked, non-ignored files
 *   pnpm check:secrets --staged                       # only what the next commit contains (pre-commit)
 *   pnpm check:secrets --bundle apps/web/.next/static # built client code: values AND secret env names
 *   pnpm check:secrets --root ../fibble-content       # scan another repo (the private one's CI uses this)
 *
 * Exit code 1 on any finding. Matches are masked, so the output is safe in CI logs.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatFinding } from '../src/scan';
import { gitRoot, scanSource, type Source } from '../src/sources';

const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    staged: { type: 'boolean', default: false },
    bundle: { type: 'string', multiple: true },
  },
});

// pnpm runs package scripts from the package folder; INIT_CWD is where the user ran it.
const cwd = process.env.INIT_CWD ?? process.cwd();
const root = values.root ? resolve(cwd, values.root) : gitRoot(cwd);

const sources: Source[] = values.bundle?.length
  ? values.bundle.map((dir) => ({ kind: 'dir', dir: resolve(root, dir), label: dir }))
  : [{ kind: values.staged ? 'staged' : 'repo', root }];

let failed = false;
for (const source of sources) {
  if (source.kind === 'dir' && !existsSync(source.dir)) {
    console.error(`✗ ${source.label} does not exist. Run pnpm build first.`);
    failed = true;
    continue;
  }
  const { files, findings } = await scanSource(source, { flagSecretNames: source.kind === 'dir' });
  const what = source.kind === 'dir' ? source.label : `${source.kind} files in ${source.root}`;
  if (findings.length) {
    failed = true;
    console.error(`✗ ${findings.length} possible secret(s) in ${what}:`);
    for (const f of findings) console.error(`  ${formatFinding(f)}`);
  } else {
    console.log(`✓ no secrets in ${files} ${what}`);
  }
}

if (failed) {
  console.error(
    '\nIf a real key was exposed, rotate it now; removing it from git does not make it safe.',
  );
  process.exit(1);
}
