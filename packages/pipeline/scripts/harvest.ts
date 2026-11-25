/**
 * Harvest DYK hooks into a JSONL file of candidates (pipeline stage 1).
 *
 *   pnpm harvest --months 2024-05,2024-06 --limit 100 --out out/candidates.jsonl
 *
 * Options:
 *   --months   comma-separated YYYY-MM archive months (required)
 *   --limit    stop after this many candidates (default 50)
 *   --out      output .jsonl path (required); relative paths resolve from where you ran pnpm
 *   --cache    response cache directory (default .cache/wikipedia)
 *
 * Only free Wikipedia and Wikidata APIs are called. Responses are cached, so a
 * re-run with the same arguments makes no network requests.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { harvestDyk } from '../src/harvest/run';
import { WikiClient } from '../src/harvest/wiki-client';
import { HarvestMonthSchema } from '../src/schemas';

// pnpm runs package scripts from the package folder; INIT_CWD is where the user ran it.
const base = process.env.INIT_CWD ?? process.cwd();

const { values } = parseArgs({
  options: {
    months: { type: 'string' },
    limit: { type: 'string', default: '50' },
    out: { type: 'string' },
    cache: { type: 'string', default: '.cache/wikipedia' },
  },
});

const Args = z.object({
  months: z
    .string()
    .transform((s) => s.split(',').map((m) => m.trim()))
    .pipe(z.array(HarvestMonthSchema).min(1)),
  limit: z.coerce.number().int().positive(),
  out: z.string().min(1),
  cache: z.string().min(1),
});

const parsed = Args.safeParse(values);
if (!parsed.success) {
  console.error(
    'Usage: pnpm harvest --months 2024-05[,2024-06] --out out/candidates.jsonl [--limit 50]',
  );
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}
const args = parsed.data;
const outFile = resolve(base, args.out);
const client = new WikiClient({ cacheDir: resolve(base, args.cache) });

const { candidates, stats } = await harvestDyk(
  { source: 'dyk', months: args.months, limit: args.limit },
  { promptVersion: 'none', dryRun: false, now: new Date() },
  client,
);

await mkdir(dirname(outFile), { recursive: true });
await writeFile(
  outFile,
  candidates.map((c) => JSON.stringify(c)).join('\n') + (candidates.length ? '\n' : ''),
);

console.log(`✓ ${stats.candidates} candidate(s) → ${outFile}`);
console.log(`  months read:        ${stats.months}`);
console.log(`  hooks considered:   ${stats.hooks}`);
console.log(`  living person flag: ${stats.livingPerson}`);
for (const [reason, n] of Object.entries(stats.skipped)) {
  if (n) console.log(`  skipped (${reason}): ${n}`);
}
console.log(`  requests: ${client.stats.requests}, cache hits: ${client.stats.cacheHits}`);
