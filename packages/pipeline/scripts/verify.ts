/**
 * Stage 4: check that lies are really false, or run the golden-set eval.
 *
 *   pnpm verify --in out/lies.jsonl --out out/verified.jsonl --budget 1
 *   pnpm verify --golden evals/golden-set.json --out out/eval-verify.jsonl --budget 2
 *
 * Options:
 *   --in         lies JSONL: one { id, category, text } per line
 *   --golden     a golden set (evals/README.md); prints the false-lie rate and lie recall
 *   --out        verdicts JSONL (required). Eval mode also writes <out>.report.json
 *   --limit      verify at most this many
 *   --budget     stop starting new lies once estimated Claude spend reaches this, in USD (default 1)
 *   --prompts    prompt folder (default: prompts/example-v1)
 *   --env-file   where SEARCH_API_KEY lives (default: .env.local); values are never printed
 *   --cache      search cache folder (default: .cache); Wikipedia and Tavily responses go here
 *   --dry-run    print the prompts and a cost ceiling; make no calls
 *
 * PAID: Haiku writes queries, Sonnet judges, and each lie uses up to 3 Tavily searches.
 * Claude uses the `ant auth login` credentials, never an API key.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { GoldenSetSchema, goldenToLies, scoreVerifyEval } from '../src/evals/verify-eval';
import { WikiClient } from '../src/harvest/wiki-client';
import { AnthropicLlmClient, Budget } from '../src/llm';
import { MODELS, PRICES } from '../src/models';
import { EXAMPLE_PROMPTS_DIR, loadPrompt, render } from '../src/prompts';
import {
  JUDGE_MAX_TOKENS,
  MAX_QUERIES,
  PLAUSIBILITY_MAX_TOKENS,
  QUERIES_MAX_TOKENS,
  verifyLies,
} from '../src/verify/run';
import { LieInputSchema } from '../src/verify/schemas';
import { TavilyClient } from '../src/verify/tavily';

const base = process.env.INIT_CWD ?? process.cwd();

const { values } = parseArgs({
  options: {
    in: { type: 'string' },
    golden: { type: 'string' },
    out: { type: 'string' },
    limit: { type: 'string' },
    budget: { type: 'string', default: '1' },
    prompts: { type: 'string' },
    'env-file': { type: 'string', default: '.env.local' },
    cache: { type: 'string', default: '.cache' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const Args = z
  .object({
    in: z.string().optional(),
    golden: z.string().optional(),
    out: z.string().min(1),
    limit: z.coerce.number().int().positive().optional(),
    budget: z.coerce.number().positive().max(50),
    prompts: z.string().optional(),
    'env-file': z.string(),
    cache: z.string(),
    'dry-run': z.boolean(),
  })
  .refine((a) => Boolean(a.in) !== Boolean(a.golden), {
    message: 'Pass exactly one of --in or --golden',
  });
const parsed = Args.safeParse(values);
if (!parsed.success) {
  console.error(
    'Usage: pnpm verify (--in lies.jsonl | --golden golden.json) --out out/verified.jsonl [--budget 1]',
  );
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}
const args = parsed.data;
const outFile = resolve(base, args.out);
const promptsDir = args.prompts ? resolve(base, args.prompts) : EXAMPLE_PROMPTS_DIR;

const golden = args.golden
  ? GoldenSetSchema.parse(JSON.parse(await readFile(resolve(base, args.golden), 'utf8')))
  : undefined;
const allLies = golden
  ? goldenToLies(golden)
  : (await readFile(resolve(base, args.in ?? ''), 'utf8'))
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => LieInputSchema.parse(JSON.parse(l)));
const lies = allLies.slice(0, args.limit);

const prompts = {
  queries: await loadPrompt(promptsDir, 'verify-queries'),
  judge: await loadPrompt(promptsDir, 'verify-judge'),
  plausibility: await loadPrompt(promptsDir, 'plausibility'),
};

if (args['dry-run']) {
  const perLie =
    (QUERIES_MAX_TOKENS * PRICES[MODELS.verifyQueries].output +
      PLAUSIBILITY_MAX_TOKENS * PRICES[MODELS.plausibility].output +
      JUDGE_MAX_TOKENS * PRICES[MODELS.verifyJudge].output) /
    1e6;
  console.log(`Prompts: ${prompts.judge.version} (${promptsDir})`);
  console.log(`Statements: ${lies.length}${golden ? ` from golden set ${golden.version}` : ''}`);
  console.log(
    `Worst-case Claude cost if nothing were capped: $${(lies.length * perLie).toFixed(2)}; budget cap: $${args.budget}`,
  );
  console.log(`Tavily searches: up to ${lies.length * MAX_QUERIES} (cached results are free)`);
  const first = lies[0];
  if (first) {
    console.log('\n--- judge system ---\n' + prompts.judge.system);
    console.log(
      '\n--- queries user ---\n' + render(prompts.queries.user, { statement: first.text }),
    );
  }
  process.exit(0);
}

// Load SEARCH_API_KEY without ever printing it.
const envFile = resolve(base, args['env-file']);
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.SEARCH_API_KEY) {
  console.error(`SEARCH_API_KEY is not set (looked in ${envFile} and the environment).`);
  process.exit(1);
}

const cacheDir = resolve(base, args.cache);
const wiki = new WikiClient({ cacheDir: join(cacheDir, 'wikipedia') });
const tavily = new TavilyClient({
  apiKey: process.env.SEARCH_API_KEY,
  cacheDir: join(cacheDir, 'tavily'),
});
const budget = new Budget(args.budget);

const { verified, stats } = await verifyLies(
  lies,
  { promptVersion: prompts.judge.version, dryRun: false, now: new Date() },
  { llm: new AnthropicLlmClient(), prompts, wiki, tavily, budget },
);

await mkdir(dirname(outFile), { recursive: true });
await writeFile(
  outFile,
  verified.map((v) => JSON.stringify(v)).join('\n') + (verified.length ? '\n' : ''),
);

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
console.log(`✓ ${verified.length} verdict(s) → ${outFile}`);
console.log(
  `  passed: ${stats.passed}; labels: ${JSON.stringify(stats.labels)}; low plausibility: ${stats.lowPlausibility}`,
);
if (stats.notStarted) console.log(`  not started (budget reached): ${stats.notStarted}`);
for (const [model, m] of budget.byModel) {
  console.log(
    `  ${model}: ${m.calls} call(s), ${m.inputTokens} in / ${m.outputTokens} out tokens, ~$${m.usd.toFixed(4)}`,
  );
}
console.log(
  `  Tavily: ${tavily.stats.searches} search(es), ${tavily.stats.cacheHits} cached; Wikipedia: ${wiki.stats.requests} request(s)`,
);
console.log(
  `  estimated Claude spend: $${stats.spentUsd.toFixed(4)} (~$${(stats.spentUsd / Math.max(1, verified.length)).toFixed(4)} per statement)`,
);

if (golden) {
  const report = scoreVerifyEval(golden, verified, stats.spentUsd);
  const reportFile = outFile.replace(/\.jsonl$/, '') + '.report.json';
  await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(
    `\nGolden set ${report.version}: ${report.truths} truths, ${report.lies} lies → ${reportFile}`,
  );
  console.log(
    `  FALSE-LIE RATE: ${pct(report.falseLieRate)}  (truths that passed as lies; target 0)`,
  );
  console.log(`  truths not labeled supported: ${report.truthsNotCaught}`);
  console.log(`  LIE RECALL: ${pct(report.lieRecall)}  (lies that passed)`);
  console.log(
    `  lies labeled supported: ${report.liesLabeledSupported}; failed on plausibility: ${report.liesLowPlausibility}; unjudged: ${report.unjudged}`,
  );
}
