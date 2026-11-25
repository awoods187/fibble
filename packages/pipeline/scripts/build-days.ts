/**
 * Build bank days from approved rounds (ADR 0013). Free: no API calls.
 *
 *   pnpm build-days --approved out/approved.jsonl --bank bank --count 7 --dry-run
 *   pnpm build-days --approved out/approved.jsonl --bank bank --count 7
 *
 * Options:
 *   --approved  approved rounds from `pnpm review apply` (required)
 *   --bank      the bank folder of YYYY-MM-DD.json days (required)
 *   --count     at most this many days (default 7)
 *   --start     first date to fill (default: the day after the last bank day, or tomorrow)
 *   --seed      lie-position shuffle seed (default: today's date)
 *   --log       review-log folder for the day-to-round mapping (default: none)
 *   --dry-run   print the plan; write nothing
 *
 * One round per category in the fixed order; never overwrites a day; never reuses a
 * Wikipedia article already in the bank; every day passes the publisher's checks.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { buildDays } from '../src/days/build';
import { ApprovedRoundSchema } from '../src/review/schemas';

const base = process.env.INIT_CWD ?? process.cwd();
const { values } = parseArgs({
  options: {
    approved: { type: 'string' },
    bank: { type: 'string' },
    count: { type: 'string', default: '7' },
    start: { type: 'string' },
    seed: { type: 'string' },
    log: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const Args = z.object({
  approved: z.string().min(1),
  bank: z.string().min(1),
  count: z.coerce.number().int().min(1).max(60),
  start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  seed: z.string().optional(),
  log: z.string().optional(),
  'dry-run': z.boolean(),
});
const parsed = Args.safeParse(values);
if (!parsed.success) {
  console.error(
    'Usage: pnpm build-days --approved out/approved.jsonl --bank bank [--count 7] [--dry-run]',
  );
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}
const args = parsed.data;
const now = new Date();
const bankDir = resolve(base, args.bank);
await mkdir(bankDir, { recursive: true });

const approved = (await readFile(resolve(base, args.approved), 'utf8'))
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => ApprovedRoundSchema.parse(JSON.parse(l)));

// What's already in the bank: its dates, and the articles its truths use.
const existingDates: string[] = [];
const usedArticles = new Set<string>();
for (const f of await readdir(bankDir)) {
  const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f);
  if (!m?.[1]) continue;
  existingDates.push(m[1]);
  const day = JSON.parse(await readFile(join(bankDir, f), 'utf8')) as {
    rounds: { statements: { source?: { title: string } }[] }[];
  };
  for (const r of day.rounds)
    for (const s of r.statements) if (s.source) usedArticles.add(s.source.title);
}

const result = buildDays({
  approved,
  existingDates,
  usedArticles,
  start: args.start,
  count: args.count,
  seed: args.seed ?? now.toISOString().slice(0, 10),
  now,
});

console.log(
  `${args['dry-run'] ? 'DRY RUN: ' : ''}${result.days.length} day(s) from ${approved.length} approved round(s); ${result.stoppedBecause}`,
);
for (const d of result.days) {
  const positions = d.puzzle.rounds.map((r) => r.lieIndex + 1).join('');
  console.log(`  ${d.puzzle.date}  #${d.puzzle.puzzleNumber}  lie cards ${positions}`);
}
const reasons: Record<string, number> = {};
for (const l of result.leftover)
  reasons[`${l.category}: ${l.reason}`] = (reasons[`${l.category}: ${l.reason}`] ?? 0) + 1;
for (const [k, n] of Object.entries(reasons)) console.log(`  leftover ${n} × ${k}`);
if (args['dry-run'] || !result.days.length) process.exit(0);

for (const d of result.days) {
  const file = join(bankDir, `${d.puzzle.date}.json`);
  if (existsSync(file)) throw new Error(`${file} appeared while building; nothing more written.`);
  await writeFile(file, JSON.stringify(d.puzzle, null, 2) + '\n');
}
if (args.log) {
  const logDir = resolve(base, args.log);
  await mkdir(logDir, { recursive: true });
  const first = result.days[0]?.puzzle.date;
  const last = result.days.at(-1)?.puzzle.date;
  const mapping = Object.fromEntries(result.days.map((d) => [d.puzzle.date, d.roundIds]));
  await writeFile(
    join(logDir, `days-${first}-to-${last}.json`),
    JSON.stringify({ builtAt: now.toISOString(), days: mapping }, null, 2) + '\n',
  );
}
console.log(`✓ ${result.days.length} day(s) written to ${bankDir}`);
