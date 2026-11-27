/**
 * Harvest candidate truths into a JSONL file (pipeline stage 1).
 *
 *   pnpm harvest --months 2024-05,2024-06 --limit 100 --out out/candidates.jsonl
 *   pnpm harvest --source unusual-articles --topics Sports,History --limit 90 --out out/ua.jsonl
 *
 * Options:
 *   --source   dyk (default) | unusual-articles
 *   --months   DYK: comma-separated YYYY-MM archive months
 *   --topics   Unusual articles: comma-separated topic subpages (default: all usable topics);
 *              names with a comma, like "Technology, inventions and products", work as is
 *   --seed     Unusual articles: which entries are sampled (default: today's date)
 *   --skip     Unusual articles: a JSONL of earlier candidates whose articles to skip
 *   --limit    DYK: stop after this many candidates; Unusual articles: per topic (default 50)
 *   --out      output .jsonl path (required); relative paths resolve from where you ran pnpm
 *   --cache    response cache directory (default .cache/wikipedia)
 *
 * Only free Wikipedia and Wikidata APIs are called. Responses are cached, so a
 * re-run with the same arguments makes no network requests.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { harvestDyk } from '../src/harvest/run';
import { harvestUnusual, parseTopics, UNUSUAL_TOPICS } from '../src/harvest/unusual';
import { WikiClient } from '../src/harvest/wiki-client';
import { HarvestMonthSchema } from '../src/schemas';

// pnpm runs package scripts from the package folder; INIT_CWD is where the user ran it.
const base = process.env.INIT_CWD ?? process.cwd();

const { values } = parseArgs({
  options: {
    source: { type: 'string', default: 'dyk' },
    months: { type: 'string' },
    topics: { type: 'string' },
    seed: { type: 'string' },
    skip: { type: 'string' },
    limit: { type: 'string', default: '50' },
    out: { type: 'string' },
    cache: { type: 'string', default: '.cache/wikipedia' },
  },
});

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
const Args = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('dyk'),
    months: z.string().transform(list).pipe(z.array(HarvestMonthSchema).min(1)),
    limit: z.coerce.number().int().positive(),
    out: z.string().min(1),
    cache: z.string().min(1),
  }),
  z.object({
    source: z.literal('unusual-articles'),
    topics: z
      .string()
      .optional()
      .transform((s) => (s ? parseTopics(s) : Object.keys(UNUSUAL_TOPICS)))
      .pipe(z.array(z.enum(Object.keys(UNUSUAL_TOPICS) as [string, ...string[]])).min(1)),
    seed: z.string().optional(),
    skip: z.string().optional(),
    limit: z.coerce.number().int().positive(),
    out: z.string().min(1),
    cache: z.string().min(1),
  }),
]);

const parsed = Args.safeParse(values);
if (!parsed.success) {
  console.error(
    'Usage: pnpm harvest --months 2024-05[,2024-06] --out out/candidates.jsonl [--limit 50]',
  );
  console.error(
    '   or: pnpm harvest --source unusual-articles [--topics Sports,History] --out out/ua.jsonl',
  );
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}
const args = parsed.data;
const outFile = resolve(base, args.out);
const client = new WikiClient({ cacheDir: resolve(base, args.cache) });
const ctx = { promptVersion: 'none', dryRun: false, now: new Date() };

let result;
if (args.source === 'dyk') {
  result = await harvestDyk({ source: 'dyk', months: args.months, limit: args.limit }, ctx, client);
} else {
  // Skip articles from an earlier harvest, so a second batch finds new ones.
  const skipTitles = new Set<string>();
  if (args.skip && existsSync(resolve(base, args.skip))) {
    for (const line of (await readFile(resolve(base, args.skip), 'utf8')).split('\n')) {
      if (line.trim())
        skipTitles.add((JSON.parse(line) as { article: { title: string } }).article.title);
    }
  }
  result = await harvestUnusual(
    {
      topics: args.topics,
      limit: args.limit,
      seed: args.seed ?? ctx.now.toISOString().slice(0, 10),
      skipTitles,
    },
    ctx,
    client,
  );
}
const { candidates, stats } = result;

await mkdir(dirname(outFile), { recursive: true });
await writeFile(
  outFile,
  candidates.map((c) => JSON.stringify(c)).join('\n') + (candidates.length ? '\n' : ''),
);

console.log(`✓ ${stats.candidates} candidate(s) → ${outFile}`);
if (args.source === 'dyk') console.log(`  months read:        ${stats.months}`);
console.log(`  entries considered: ${stats.hooks}`);
console.log(`  living person flag: ${stats.livingPerson}`);
if ('sensitive' in stats && stats.sensitive)
  console.log(`  banned topic (skipped, free): ${stats.sensitive}`);
for (const [reason, n] of Object.entries(stats.skipped)) {
  if (n) console.log(`  skipped (${reason}): ${n}`);
}
if (args.source === 'unusual-articles') {
  const byCategory: Record<string, number> = {};
  for (const c of candidates)
    byCategory[c.categoryHint ?? '?'] = (byCategory[c.categoryHint ?? '?'] ?? 0) + 1;
  console.log(`  by category hint: ${JSON.stringify(byCategory)}`);
}
console.log(`  requests: ${client.stats.requests}, cache hits: ${client.stats.cacheHits}`);
