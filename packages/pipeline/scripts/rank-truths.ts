/**
 * Sort accepted truths into great / fine / boring by comparing them in batches (ADR 0009).
 *
 *   pnpm rank-truths --in out/truths.jsonl --out out/truths.ranked.jsonl --budget 1
 *
 * Writes every truth, with `fun` set on those that were ranked. Then pass
 * `--min-fun great` to `pnpm generate-lies` to write lies only for the best.
 * PAID: one Opus call per batch of 10 (about $0.03 each).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { AnthropicLlmClient, Budget } from '../src/llm';
import { EXAMPLE_PROMPTS_DIR, loadPrompt, render } from '../src/prompts';
import { maxGreat, RANK_BATCH_SIZE, rankTruths } from '../src/rank/run';
import { RewordedTruthSchema } from '../src/reword/schemas';

const base = process.env.INIT_CWD ?? process.cwd();
const { values } = parseArgs({
  options: {
    in: { type: 'string' },
    out: { type: 'string' },
    budget: { type: 'string', default: '1' },
    prompts: { type: 'string' },
    seed: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const Args = z.object({
  in: z.string().min(1),
  out: z.string().min(1),
  budget: z.coerce.number().positive().max(20),
  prompts: z.string().optional(),
  seed: z.string().optional(),
  'dry-run': z.boolean(),
});
const parsed = Args.safeParse(values);
if (!parsed.success) {
  console.error(
    'Usage: pnpm rank-truths --in out/truths.jsonl --out out/truths.ranked.jsonl [--budget 1]',
  );
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}
const args = parsed.data;
const truths = (await readFile(resolve(base, args.in), 'utf8'))
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => RewordedTruthSchema.parse(JSON.parse(l)));
const prompt = await loadPrompt(
  args.prompts ? resolve(base, args.prompts) : EXAMPLE_PROMPTS_DIR,
  'rank-fun',
);

if (args['dry-run']) {
  const batches = Math.ceil(truths.length / RANK_BATCH_SIZE);
  console.log(
    `Prompts: ${prompt.version}; truths: ${truths.length}; batches of ${RANK_BATCH_SIZE}: ${batches}; at most ${maxGreat(RANK_BATCH_SIZE)} great per batch`,
  );
  console.log(
    '\n--- system ---\n' + render(prompt.system, { max_great: String(maxGreat(RANK_BATCH_SIZE)) }),
  );
  process.exit(0);
}

const budget = new Budget(args.budget);
const result = await rankTruths(
  truths,
  { promptVersion: prompt.version, dryRun: false, now: new Date() },
  { llm: new AnthropicLlmClient(), prompt, budget, seed: args.seed },
);
const outFile = resolve(base, args.out);
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, result.truths.map((t) => JSON.stringify(t)).join('\n') + '\n');
const { stats } = result;
console.log(`✓ ranked ${stats.ranked} of ${stats.truths} → ${outFile}`);
console.log(
  `  great ${stats.tiers.great} · fine ${stats.tiers.fine} · boring ${stats.tiers.boring}${stats.unranked ? ` · unranked ${stats.unranked}` : ''}`,
);
console.log(`  estimated spend: $${stats.spentUsd.toFixed(4)}`);
