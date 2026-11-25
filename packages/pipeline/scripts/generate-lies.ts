/**
 * Stage 3 (and optionally stage 4): write lies for truth pairs, then verify them.
 *
 *   pnpm generate-lies --truths out/truths.jsonl --out out/lies.jsonl --verify --budget 3
 *
 * Options:
 *   --truths     accepted truths JSONL from `pnpm reword` (required); paired within categories
 *   --out        generation records JSONL (required). With --verify, also writes
 *                <out>.verified.jsonl and the gate 2 report <out>.gate2.json
 *   --pairs      use at most this many truth pairs
 *   --min-fun    only truths ranked at least this tier by `pnpm rank-truths`: great | fine | any
 *                (default fine: drop the boring ones; unranked truth files are used as they are)
 *   --count      lies per pair (default 5, the PRD's number)
 *   --verify     run stage 4 on every lie that passes the code checks
 *   --budget     one cap for generation and verification together, in USD (default 1)
 *   --prompts    prompt folder (default: prompts/example-v1)
 *   --env-file   where SEARCH_API_KEY lives, for --verify (default: .env.local)
 *   --cache      search cache folder (default: .cache)
 *   --dry-run    print the first prompt and a cost ceiling; make no calls
 *
 * PAID: Opus writes the lies; --verify adds Sonnet, Haiku and Tavily. Claude uses the
 * `ant auth login` credentials. Output is unreleased puzzle material: run it from
 * fibble-content, whose out/ is git-ignored.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  DEFAULT_LIE_COUNT,
  GENERATE_MAX_TOKENS,
  gate2Report,
  generateForPairs,
  pairTruths,
} from '../src/generate/run';
import { WikiClient } from '../src/harvest/wiki-client';
import { atLeast } from '../src/rank/run';
import { AnthropicLlmClient, Budget } from '../src/llm';
import { MODELS, PRICES } from '../src/models';
import { EXAMPLE_PROMPTS_DIR, loadPrompt, render } from '../src/prompts';
import { RewordedTruthSchema } from '../src/reword/schemas';
import { verifyLies } from '../src/verify/run';
import { TavilyClient } from '../src/verify/tavily';

const base = process.env.INIT_CWD ?? process.cwd();

const { values } = parseArgs({
  options: {
    truths: { type: 'string' },
    out: { type: 'string' },
    pairs: { type: 'string' },
    'min-fun': { type: 'string', default: 'fine' },
    count: { type: 'string', default: String(DEFAULT_LIE_COUNT) },
    verify: { type: 'boolean', default: false },
    budget: { type: 'string', default: '1' },
    prompts: { type: 'string' },
    'env-file': { type: 'string', default: '.env.local' },
    cache: { type: 'string', default: '.cache' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const Args = z.object({
  truths: z.string().min(1),
  out: z.string().min(1),
  pairs: z.coerce.number().int().positive().optional(),
  'min-fun': z.enum(['great', 'fine', 'any']),
  count: z.coerce.number().int().min(1).max(10),
  verify: z.boolean(),
  budget: z.coerce.number().positive().max(50),
  prompts: z.string().optional(),
  'env-file': z.string(),
  cache: z.string(),
  'dry-run': z.boolean(),
});
const parsed = Args.safeParse(values);
if (!parsed.success) {
  console.error(
    'Usage: pnpm generate-lies --truths out/truths.jsonl --out out/lies.jsonl [--verify] [--budget 1]',
  );
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}
const args = parsed.data;
const outFile = resolve(base, args.out);
const stem = outFile.replace(/\.jsonl$/, '');
const promptsDir = args.prompts ? resolve(base, args.prompts) : EXAMPLE_PROMPTS_DIR;

const truths = (await readFile(resolve(base, args.truths), 'utf8'))
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => RewordedTruthSchema.parse(JSON.parse(l)));
const minFun = args['min-fun'];
const ranked = truths.some((t) => t.fun);
// Unranked files (not run through rank-truths) are used as they are, with a notice.
const chosen = minFun === 'any' || !ranked ? truths : atLeast(truths, minFun);
if (minFun !== 'any' && !ranked) {
  console.log(
    `Truths aren't ranked (run pnpm rank-truths first to drop boring ones); using all ${truths.length}`,
  );
} else if (minFun !== 'any') {
  console.log(
    `Using ${chosen.length} of ${truths.length} truths ranked ${minFun}${minFun === 'fine' ? ' or great' : ''}`,
  );
}
const pairs = pairTruths(chosen).slice(0, args.pairs);
const prompt = await loadPrompt(promptsDir, 'generate-lies');

if (args['dry-run']) {
  const perPair = (GENERATE_MAX_TOKENS * PRICES[MODELS.generateLies].output) / 1e6;
  console.log(`Prompts: ${prompt.version} (${promptsDir})`);
  console.log(`Truths: ${truths.length}; pairs: ${pairs.length}; lies per pair: ${args.count}`);
  console.log(
    `Worst-case generation cost if nothing were capped: $${(pairs.length * perPair).toFixed(2)}; budget cap: $${args.budget}${args.verify ? ' (shared with verification)' : ''}`,
  );
  const first = pairs[0];
  if (first) {
    console.log(
      '\n--- user (first pair) ---\n' +
        render(prompt.user, {
          category: first[0].category,
          truth_1: first[0].text,
          truth_2: first[1].text,
          count: String(args.count),
        }),
    );
  }
  process.exit(0);
}

let tavily: TavilyClient | undefined;
if (args.verify) {
  const envFile = resolve(base, args['env-file']);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  if (!process.env.SEARCH_API_KEY) {
    console.error(`SEARCH_API_KEY is not set (looked in ${envFile} and the environment).`);
    process.exit(1);
  }
  tavily = new TavilyClient({
    apiKey: process.env.SEARCH_API_KEY,
    cacheDir: join(resolve(base, args.cache), 'tavily'),
  });
}

const llm = new AnthropicLlmClient();
const budget = new Budget(args.budget);
const ctx = { promptVersion: prompt.version, dryRun: false, now: new Date() };
const jsonl = (rows: unknown[]) =>
  rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

const { records, notStarted } = await generateForPairs(pairs, ctx, {
  llm,
  prompt,
  budget,
  count: args.count,
});
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, jsonl(records));
const lies = records.flatMap((r) => r.accepted);
console.log(
  `✓ ${records.length} pair(s) → ${lies.length} lie(s) passed the code checks → ${outFile}`,
);
if (notStarted) console.log(`  pairs not started (budget reached): ${notStarted}`);
const reasons: Record<string, number> = {};
for (const r of records)
  for (const x of r.rejected)
    for (const reason of x.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
console.log(`  rejected by checks: ${JSON.stringify(reasons)}`);

if (tavily) {
  const verifyPrompts = {
    queries: await loadPrompt(promptsDir, 'verify-queries'),
    judge: await loadPrompt(promptsDir, 'verify-judge'),
    plausibility: await loadPrompt(promptsDir, 'plausibility'),
  };
  const wiki = new WikiClient({ cacheDir: join(resolve(base, args.cache), 'wikipedia') });
  const { verified, stats } = await verifyLies(
    lies.map(({ id, category, text }) => ({ id, category, text })),
    ctx,
    { llm, prompts: verifyPrompts, wiki, tavily, budget },
  );
  await writeFile(`${stem}.verified.jsonl`, jsonl(verified));
  if (stats.notStarted) console.log(`  lies not verified (budget reached): ${stats.notStarted}`);

  const report = gate2Report(pairs, records, verified);
  await writeFile(`${stem}.gate2.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(`\nGate 2 → ${stem}.gate2.json`);
  console.log(
    `  rounds with at least one passing lie: ${report.roundsWithPassingLie} / ${report.rounds}`,
  );
  console.log(
    `  lies: ${report.liesGenerated} generated → ${report.liesPassedChecks} passed checks → ${report.liesPassedVerification} passed verification`,
  );
  console.log(
    `  "lies" the judge found TRUE (would have been false lies): ${report.liesSupported}`,
  );
  console.log(`  plausibility of checked lies: ${JSON.stringify(report.plausibility)}`);
  console.log(`  Tavily: ${tavily.stats.searches} search(es), ${tavily.stats.cacheHits} cached`);
  console.log(
    `  cost per round (truths + generation + verification): ~$${report.costPerRoundUsd.toFixed(3)}`,
  );
}
for (const [model, m] of budget.byModel) {
  console.log(
    `  ${model}: ${m.calls} call(s), ${m.inputTokens} in / ${m.outputTokens} out tokens, ~$${m.usd.toFixed(4)}`,
  );
}
console.log(`  estimated Claude spend this run: $${budget.spentUsd.toFixed(4)}`);
