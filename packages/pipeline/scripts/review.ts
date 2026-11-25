/**
 * Stage 7: human review of assembled rounds (ADR 0013). Free: no API calls.
 *
 *   pnpm review page  --rounds out/rounds.jsonl --lies out/lies.jsonl --out out/review.html
 *   pnpm review apply --rounds out/rounds.jsonl --lies out/lies.jsonl \
 *                     --decisions ~/Downloads/review-…-decisions.json \
 *                     --approved out/approved.jsonl --log review-log/ [--reviewer Andy]
 *
 * `page` writes an offline HTML page (no network requests). `apply` turns the downloaded
 * decisions into approved rounds (appended to --approved) and a review-log entry in --log.
 * Both handle unreleased content: run them in fibble-content.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { z } from 'zod';
import { CandidateRoundSchema } from '../src/assemble/schemas';
import { GenerationRecordSchema } from '../src/generate/schemas';
import { buildReviewPage } from '../src/review/page';
import { applyDecisions, buildReviewItems, reviewSetIdFor } from '../src/review/review';
import { ReviewDecisionsSchema } from '../src/review/schemas';

const base = process.env.INIT_CWD ?? process.cwd();
const [mode, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    rounds: { type: 'string', multiple: true },
    lies: { type: 'string', multiple: true },
    out: { type: 'string' },
    decisions: { type: 'string' },
    approved: { type: 'string' },
    log: { type: 'string' },
    reviewer: { type: 'string' },
  },
});
const need = (v: string | undefined, flag: string) => {
  if (!v) {
    console.error(`Missing --${flag}. See the usage at the top of scripts/review.ts.`);
    process.exit(1);
  }
  return resolve(base, v);
};
const jsonl = async <T>(files: string[] | undefined, flag: string, schema: z.ZodType<T>) => {
  if (!files?.length) need(undefined, flag);
  const rows: T[] = [];
  for (const f of files ?? []) {
    for (const line of (await readFile(resolve(base, f), 'utf8')).split('\n')) {
      if (line.trim()) rows.push(schema.parse(JSON.parse(line)));
    }
  }
  return rows;
};

// Several batches can be reviewed together: pass --rounds and --lies more than once.
const rounds = await jsonl(values.rounds, 'rounds', CandidateRoundSchema);
const lies = (await jsonl(values.lies, 'lies', GenerationRecordSchema)).flatMap((r) => r.accepted);
const items = buildReviewItems(rounds, lies);
const setId = reviewSetIdFor(items.map((i) => i.roundId));

if (mode === 'page') {
  const out = need(values.out, 'out');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buildReviewPage(setId, items));
  const byCategory: Record<string, number> = {};
  for (const i of items) byCategory[i.category] = (byCategory[i.category] ?? 0) + 1;
  console.log(`✓ ${items.length} round(s) to review, set ${setId}`);
  console.log(`  by category: ${JSON.stringify(byCategory)}`);
  console.log(`  page: ${out}  ← open this in a browser`);
} else if (mode === 'apply') {
  const decisions = ReviewDecisionsSchema.parse(
    JSON.parse(await readFile(need(values.decisions, 'decisions'), 'utf8')),
  );
  const reviewer =
    values.reviewer ??
    execFileSync('git', ['config', 'user.name'], { cwd: base, encoding: 'utf8' }).trim() ??
    'unknown';
  const { approved, log } = applyDecisions(rounds, lies, decisions, reviewer);
  const approvedFile = need(values.approved, 'approved');
  const logDir = need(values.log, 'log');
  // Don't append the same review twice.
  const already =
    existsSync(approvedFile) &&
    (await readFile(approvedFile, 'utf8')).includes(`"reviewSetId":"${setId}"`);
  if (already) {
    console.error(
      `✗ ${approvedFile} already has rounds from review set ${setId}. Nothing written.`,
    );
    process.exit(1);
  }
  await mkdir(dirname(approvedFile), { recursive: true });
  await appendFile(
    approvedFile,
    approved.map((a) => JSON.stringify(a)).join('\n') + (approved.length ? '\n' : ''),
  );
  await mkdir(logDir, { recursive: true });
  const logFile = join(logDir, `${decisions.decidedAt.slice(0, 10)}-${setId}.json`);
  await writeFile(logFile, JSON.stringify(log, null, 2) + '\n');
  console.log(
    `✓ ${log.counts.approved} approved, ${log.counts.rejected} rejected, ${log.counts.undecided} undecided`,
  );
  const reasons: Record<string, number> = {};
  for (const d of log.decisions) if (d.reason) reasons[d.reason] = (reasons[d.reason] ?? 0) + 1;
  if (Object.keys(reasons).length) console.log(`  rejected for: ${JSON.stringify(reasons)}`);
  console.log(`  alternate lie chosen: ${log.decisions.filter((d) => d.usedAlternateLie).length}`);
  console.log(`  approved rounds → ${approvedFile}`);
  console.log(`  review log → ${logFile}`);
} else {
  console.error('Usage: pnpm review page … | pnpm review apply …  (see scripts/review.ts)');
  process.exit(1);
}
