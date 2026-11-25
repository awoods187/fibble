/**
 * Stage 2: turn harvested candidates into checked, reworded truths.
 *
 *   pnpm reword --in out/candidates.jsonl --out out/truths.jsonl --limit 40 --budget 2
 *
 * Options:
 *   --in         candidates JSONL from `pnpm harvest` (required)
 *   --out        accepted truths JSONL (required); rejections go to <out>.rejected.jsonl
 *   --limit      read at most this many candidates (default: all)
 *   --budget     stop starting new candidates once estimated spend reaches this, in USD (default 1)
 *   --prompts    prompt folder (default: prompts/example-v1); the private repo passes its own
 *   --dry-run    print the first prompts and a cost ceiling; make no API calls
 *
 * Calls Claude with the `ant auth login` credentials (never an API key) and spends
 * real money: Haiku drafts every candidate, Opus checks the ones that pass. Output
 * is unreleased puzzle material, so run it from fibble-content (its out/ is ignored).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { AnthropicLlmClient, Budget } from '../src/llm';
import { MODELS, PRICES } from '../src/models';
import { EXAMPLE_PROMPTS_DIR, loadPrompt, render } from '../src/prompts';
import {
  CATEGORY_LIST,
  DRAFT_MAX_TOKENS,
  ENTAILMENT_MAX_TOKENS,
  rewordCandidates,
} from '../src/reword/run';
import { CandidateSchema } from '../src/schemas';

const base = process.env.INIT_CWD ?? process.cwd();

const { values } = parseArgs({
  options: {
    in: { type: 'string' },
    out: { type: 'string' },
    limit: { type: 'string' },
    budget: { type: 'string', default: '1' },
    prompts: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const Args = z.object({
  in: z.string().min(1),
  out: z.string().min(1),
  limit: z.coerce.number().int().positive().optional(),
  budget: z.coerce.number().positive().max(50),
  prompts: z.string().optional(),
  'dry-run': z.boolean(),
});
const parsed = Args.safeParse(values);
if (!parsed.success) {
  console.error(
    'Usage: pnpm reword --in out/candidates.jsonl --out out/truths.jsonl [--limit 40] [--budget 1]',
  );
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}
const args = parsed.data;
const inFile = resolve(base, args.in);
const outFile = resolve(base, args.out);
const rejectedFile = outFile.replace(/\.jsonl$/, '') + '.rejected.jsonl';
const promptsDir = args.prompts ? resolve(base, args.prompts) : EXAMPLE_PROMPTS_DIR;

const lines = (await readFile(inFile, 'utf8')).split('\n').filter((l) => l.trim());
const candidates = lines.slice(0, args.limit).map((l, i) => {
  const result = CandidateSchema.safeParse(JSON.parse(l));
  if (!result.success) throw new Error(`${inFile} line ${i + 1}: ${z.prettifyError(result.error)}`);
  return result.data;
});
const prompts = {
  reword: await loadPrompt(promptsDir, 'reword'),
  entailment: await loadPrompt(promptsDir, 'entailment'),
};

if (args['dry-run']) {
  const first = candidates.find((c) => !c.involvesLivingPerson);
  const eligible = candidates.filter((c) => !c.involvesLivingPerson).length;
  // A ceiling, not an estimate: every candidate drafted and checked at max output.
  const perCandidate =
    (DRAFT_MAX_TOKENS * PRICES[MODELS.rewordDraft].output +
      ENTAILMENT_MAX_TOKENS * PRICES[MODELS.entailment].output) /
    1e6;
  console.log(`Prompts: ${prompts.reword.version} (${promptsDir})`);
  console.log(
    `Candidates: ${candidates.length}, eligible after the living-person filter: ${eligible}`,
  );
  console.log(
    `Worst-case cost if nothing were capped: $${(eligible * perCandidate).toFixed(2)}; budget cap: $${args.budget}`,
  );
  if (first) {
    console.log(
      '\n--- reword system ---\n' + render(prompts.reword.system, { categories: CATEGORY_LIST }),
    );
    console.log(
      '\n--- reword user (first eligible candidate) ---\n' +
        render(prompts.reword.user, {
          hook: first.rawClaim,
          article_title: first.article.title,
          evidence: first.contextText,
        }),
    );
  }
  process.exit(0);
}

const budget = new Budget(args.budget);
const { accepted, rejected, stats } = await rewordCandidates(
  candidates,
  { promptVersion: prompts.reword.version, dryRun: false, now: new Date() },
  { llm: new AnthropicLlmClient(), prompts, budget },
);

const jsonl = (rows: unknown[]) =>
  rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, jsonl(accepted));
await writeFile(rejectedFile, jsonl(rejected));

console.log(`✓ ${stats.accepted} accepted of ${stats.candidates} → ${outFile}`);
console.log(`  rejected → ${rejectedFile}`);
console.log(
  `  by step: filter ${stats.rejected.filter}, draft ${stats.rejected.draft}, checks ${stats.rejected.checks}, entailment ${stats.rejected.entailment}`,
);
if (stats.notStarted) console.log(`  not started (budget reached): ${stats.notStarted}`);
for (const [reason, n] of Object.entries(stats.reasons).sort((a, b) => b[1] - a[1])) {
  console.log(`  reason ${reason}: ${n}`);
}
for (const [model, m] of budget.byModel) {
  console.log(
    `  ${model}: ${m.calls} call(s), ${m.inputTokens} in / ${m.outputTokens} out tokens, ~$${m.usd.toFixed(4)}`,
  );
}
const perTruth = stats.accepted ? stats.spentUsd / stats.accepted : 0;
console.log(
  `  estimated spend: $${stats.spentUsd.toFixed(4)}${stats.accepted ? ` ($${perTruth.toFixed(4)} per accepted truth)` : ''}`,
);
