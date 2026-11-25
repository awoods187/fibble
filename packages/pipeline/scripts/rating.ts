/**
 * Human believability ratings: build the page, then compare the ratings with the model's.
 *
 *   pnpm rating page --truths out/truths.jsonl --lies out/lies.jsonl --out out/rate.html
 *   pnpm rating report --key out/rate.key.json --ratings ~/Downloads/rate-…-ratings.json \
 *                      --verified out/lies.verified.jsonl [--truths out/truths.ranked.jsonl]
 *
 * With --truths from `pnpm rank-truths`, the report also compares the ranker's tiers with
 * your "good for the game" ratings.
 *
 * `page` writes a self-contained HTML file and, beside it, the answer key (<out>.key.json).
 * Open the HTML from disk: it makes no network requests. Both files are unreleased puzzle
 * material, so build them in fibble-content's git-ignored out/. Free: no API calls.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { GenerationRecordSchema } from '../src/generate/schemas';
import {
  buildRatingPage,
  buildRatingSet,
  RatingsFileSchema,
  type RatingKeyEntry,
} from '../src/rating/page';
import { ratingReport } from '../src/rating/report';
import { RewordedTruthSchema } from '../src/reword/schemas';
import { MIN_PLAUSIBILITY, VerifiedLieSchema } from '../src/verify/schemas';

const base = process.env.INIT_CWD ?? process.cwd();
const [mode, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    truths: { type: 'string' },
    lies: { type: 'string' },
    out: { type: 'string' },
    seed: { type: 'string' },
    key: { type: 'string' },
    ratings: { type: 'string' },
    verified: { type: 'string' },
  },
});
const path = (p: string | undefined, flag: string) => {
  if (!p) {
    console.error(`Missing --${flag}. See the usage at the top of scripts/rating.ts.`);
    process.exit(1);
  }
  return resolve(base, p);
};
const jsonl = async <T>(file: string, schema: z.ZodType<T>) =>
  (await readFile(file, 'utf8'))
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => schema.parse(JSON.parse(l)));

if (mode === 'page') {
  const truths = await jsonl(path(values.truths, 'truths'), RewordedTruthSchema);
  const records = await jsonl(path(values.lies, 'lies'), GenerationRecordSchema);
  const lies = records.flatMap((r) => r.accepted);
  const outFile = path(values.out, 'out');
  const set = buildRatingSet(truths, lies, values.seed ?? new Date().toISOString().slice(0, 10));
  const keyFile = outFile.replace(/\.html$/, '') + '.key.json';
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, buildRatingPage(set));
  await writeFile(keyFile, JSON.stringify({ setId: set.setId, key: set.key }, null, 2) + '\n');
  console.log(
    `✓ ${set.items.length} statements (${truths.length} truths, ${lies.length} lies), set ${set.setId}`,
  );
  console.log(`  page: ${outFile}  ← open this in a browser`);
  console.log(`  key:  ${keyFile}  ← don't open it until you've rated`);
} else if (mode === 'report') {
  const keyFile = z
    .object({
      setId: z.string(),
      key: z.record(
        z.string(),
        z.object({ expected: z.enum(['truth', 'lie']), sourceId: z.string() }),
      ),
    })
    .parse(JSON.parse(await readFile(path(values.key, 'key'), 'utf8')));
  const ratings = RatingsFileSchema.parse(
    JSON.parse(await readFile(path(values.ratings, 'ratings'), 'utf8')),
  );
  if (ratings.setId !== keyFile.setId) {
    console.error(`Ratings are for set ${ratings.setId}, but the key is for ${keyFile.setId}.`);
    process.exit(1);
  }
  const verified = values.verified
    ? await jsonl(path(values.verified, 'verified'), VerifiedLieSchema)
    : [];
  const model = new Map(
    verified.flatMap((v) =>
      v.plausibility === undefined ? [] : [[v.lie.id, v.plausibility] as const],
    ),
  );
  const truthsForTiers = values.truths
    ? await jsonl(path(values.truths, 'truths'), RewordedTruthSchema)
    : [];
  const tiers = new Map(
    truthsForTiers.flatMap((t) => (t.fun ? [[t.candidateId, t.fun.tier] as const] : [])),
  );
  const r = ratingReport(keyFile.key as Record<string, RatingKeyEntry>, ratings, model, tiers);
  const pct = (x: number) => `${Math.round(100 * x)}%`;
  console.log(`Set ${r.setId}: ${r.rated} rated, ${r.knewExcluded} excluded as already known`);
  console.log(
    `  truths: n=${r.truths.n}, mean ${r.truths.mean.toFixed(2)}, ${pct(r.truths.passRate)} at ${MIN_PLAUSIBILITY}+, ${JSON.stringify(r.truths.dist)}`,
  );
  console.log(
    `  lies:   n=${r.lies.n}, mean ${r.lies.mean.toFixed(2)}, ${pct(r.lies.passRate)} at ${MIN_PLAUSIBILITY}+, ${JSON.stringify(r.lies.dist)}`,
  );
  const f = (x: typeof r.fun.truths) =>
    x.rated
      ? `boring ${x.boring} · fine ${x.fine} · great ${x.great} (${pct(x.greatRate)} great, ${pct(x.boringRate)} boring)`
      : 'not rated';
  console.log(`\n  Good for the game? truths: ${f(r.fun.truths)}`);
  console.log(`                     lies:   ${f(r.fun.lies)}`);
  if (Object.keys(r.rankerVsHuman).length) {
    console.log('\n  Ranker tier vs your rating (truths):');
    for (const tier of ['great', 'fine', 'boring'] as const) {
      const row = r.rankerVsHuman[tier];
      if (row)
        console.log(
          `    ranker ${tier.padEnd(6)} → you: great ${row.great} · fine ${row.fine} · boring ${row.boring}`,
        );
    }
  }
  if (r.compared) {
    console.log(
      `\n  Model vs you on ${r.compared} lies: model is ${r.meanModelMinusHuman.toFixed(2)} points ${r.meanModelMinusHuman < 0 ? 'harsher' : 'kinder'} on average`,
    );
    console.log(
      `  both pass ${r.bothPass} · only you pass ${r.humanOnlyPass} · only the model passes ${r.modelOnlyPass} · neither ${r.neitherPass}`,
    );
  }
  const reportFile = path(values.ratings, 'ratings').replace(/\.json$/, '') + '.report.json';
  await writeFile(reportFile, JSON.stringify(r, null, 2) + '\n');
  console.log(`\n  → ${reportFile}`);
} else {
  console.error('Usage: pnpm rating page … | pnpm rating report …  (see scripts/rating.ts)');
  process.exit(1);
}
