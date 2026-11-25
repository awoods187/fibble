/**
 * Validate puzzle content against the shared Zod schema.
 *
 *   pnpm validate:content                 # checks content-example/
 *   pnpm validate:content path/to/bank    # checks another folder (e.g. the private bank)
 */
import { resolve } from 'node:path';
import { validateContentDir } from '../src/validate-content';

const repoRoot = resolve(import.meta.dirname, '../../..');
const arg = process.argv[2];
const dir = arg ? resolve(process.cwd(), arg) : resolve(repoRoot, 'content-example');
const isExample = !arg;

const { files, issues } = await validateContentDir(dir, { requireSample: isExample });

if (issues.length > 0) {
  console.error(`✗ ${issues.length} problem(s) in ${dir}:`);
  for (const { file, message } of issues) console.error(`  ${file}: ${message}`);
  process.exit(1);
}
console.log(`✓ ${files.length} puzzle file(s) valid in ${dir}`);
