/**
 * Stage 5: assemble rounds from verified lies with the style-spotter test.
 *
 *   pnpm assemble --truths out/truths.ranked.jsonl --lies out/lies.jsonl \
 *                 --verified out/lies.verified.jsonl --out out/rounds.jsonl --budget 1
 *
 * For each truth pair, every verified lie is shown to Haiku with the two truths, shuffled,
 * 10 times. The lie it finds least often (and at most 70% of the time) makes the round.
 * Writes rounds JSONL in the shared puzzle format, plus <out>.unassembled.jsonl.
 * PAID: about $0.003 per lie scored.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { assembleRounds } from '../src/assemble/run';
import { GenerationRecordSchema } from '../src/generate/schemas';
import { AnthropicLlmClient, Budget } from '../src/llm';
import { STYLE_SPOTTER } from '../src/models';
import { EXAMPLE_PROMPTS_DIR, loadPrompt } from '../src/prompts';
import { RewordedTruthSchema } from '../src/reword/schemas';
import { VerifiedLieSchema } from '../src/verify/schemas';

const base = process.env.INIT_CWD ?? process.cwd();
const { values } = parseArgs({
  options: {
    truths: { type: 'string' },
    lies: { type: 'string' },
    verified: { type: 'string' },
    out: { type: 'string' },
    budget: { type: 'string', default: '1' },
    samples: { type: 'string', default: String(STYLE_SPOTTER.samples) },
    prompts: { type: 'string' },
    seed: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const Args = z.object({
  truths: z.string().min(1),
  lies: z.string().min(1),
  verified: z.string().min(1),
  out: z.string().min(1),
  budget: z.coerce.number().positive().max(20),
  samples: z.coerce.number().int().min(1).max(30),
  prompts: z.string().optional(),
  seed: z.string().optional(),
  'dry-run': z.boolean(),
});
const parsed = Args.safeParse(values);
if (!parsed.success) {
  console.error(
    'Usage: pnpm assemble --truths … --lies … --verified … --out out/rounds.jsonl [--budget 1]',
  );
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}
const args = parsed.data;
const jsonl = async <T>(p: string, schema: z.ZodType<T>) =>
  (await readFile(resolve(base, p), 'utf8'))
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => schema.parse(JSON.parse(l)));

const truths = await jsonl(args.truths, RewordedTruthSchema);
const records = await jsonl(args.lies, GenerationRecordSchema);
const verified = await jsonl(args.verified, VerifiedLieSchema);
const prompt = await loadPrompt(
  args.prompts ? resolve(base, args.prompts) : EXAMPLE_PROMPTS_DIR,
  'style-spotter',
);
const passing = verified.filter((v) => v.passed).length;

if (args['dry-run']) {
  console.log(
    `Prompts: ${prompt.version}; truth pairs: ${records.length}; verified lies that passed: ${passing}`,
  );
  console.log(
    `Spotter calls: up to ${passing * args.samples} (${args.samples} per lie); budget cap $${args.budget}`,
  );
  process.exit(0);
}

const budget = new Budget(args.budget);
const { rounds, unassembled, spentUsd } = await assembleRounds(
  truths,
  records,
  verified,
  { promptVersion: prompt.version, dryRun: false, now: new Date() },
  { llm: new AnthropicLlmClient(), prompt, budget, samples: args.samples, seed: args.seed },
);
const outFile = resolve(base, args.out);
const stem = outFile.replace(/\.jsonl$/, '');
const lines = (rows: unknown[]) =>
  rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, lines(rounds));
await writeFile(`${stem}.unassembled.jsonl`, lines(unassembled));

const pct = (x: number) => `${Math.round(100 * x)}%`;
console.log(
  `✓ ${rounds.length} round(s) assembled from ${records.length} truth pair(s) → ${outFile}`,
);
for (const r of rounds) {
  const flags = r.heuristicFlags.length ? `, flags: ${r.heuristicFlags.join(', ')}` : '';
  console.log(
    `  ${r.round.category.padEnd(20)} lie at card ${r.round.lieIndex + 1}, spotted ${pct(r.spotterDetectionRate)}, difficulty ${r.round.difficulty}${flags}; ${r.alternates.length} alternate(s)`,
  );
}
for (const u of unassembled)
  console.log(`  not assembled (${u.truthIds.join(' + ')}): ${u.reason}`);
const all = rounds.flatMap((r) => [
  r.spotterDetectionRate,
  ...r.alternates.map((a) => a.spotterDetectionRate),
]);
if (all.length) {
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  console.log(`  spotter detection across all ${all.length} scored lies: mean ${pct(mean)}`);
}
console.log(`  estimated spend: $${spentUsd.toFixed(4)}`);
