/**
 * Publish bank days to Postgres: today through today + 3 (UTC) by default (ADR 0012).
 *
 *   pnpm publish-days --bank bank --dry-run      # show the plan; write nothing
 *   pnpm publish-days --bank bank                # publish
 *
 * Options:
 *   --bank          folder of YYYY-MM-DD.json days (required)
 *   --days          how many days from today (default 4)
 *   --dry-run       print the plan only
 *   --allow-sample  publish "sample": true days (the one-off hosting smoke test; never in CI)
 *
 * Connects as fibble_publisher via DATABASE_URL_PUBLISHER. Locally that is a 1Password
 * reference, so run through `op run` (fibble-content's runner does it). Every day is checked
 * (schema, date, no samples, banned topics); any invalid day stops the run before any write.
 * A day that's already live is never changed.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { connect, PuzzleStore, readSecret } from '@fibble/db';
import { z } from 'zod';
import { canPublish, DEFAULT_PUBLISH_DAYS, planPublish, utcDay } from '../src/publish/plan';

const base = process.env.INIT_CWD ?? process.cwd();
const { values } = parseArgs({
  options: {
    bank: { type: 'string' },
    days: { type: 'string', default: String(DEFAULT_PUBLISH_DAYS) },
    'dry-run': { type: 'boolean', default: false },
    'allow-sample': { type: 'boolean', default: false },
  },
});
const Args = z.object({
  bank: z.string().min(1),
  days: z.coerce.number().int().min(1).max(14),
  'dry-run': z.boolean(),
  'allow-sample': z.boolean(),
});
const parsed = Args.safeParse(values);
if (!parsed.success) {
  console.error('Usage: pnpm publish-days --bank bank [--days 4] [--dry-run]');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}
const args = parsed.data;
const now = new Date();
const bankDir = resolve(base, args.bank);
const window = Array.from({ length: args.days }, (_, i) => utcDay(now, i));

// Read only the bank files inside the window.
const files = new Set(await readdir(bankDir));
const bank = new Map<string, unknown>();
for (const date of window) {
  if (files.has(`${date}.json`)) {
    bank.set(date, JSON.parse(await readFile(join(bankDir, `${date}.json`), 'utf8')));
  }
}

const store = new PuzzleStore(connect(readSecret('DATABASE_URL_PUBLISHER')));
const stored = await store.getDays(window);
const plan = planPublish({ bank, stored, now, days: args.days, allowSample: args['allow-sample'] });

console.log(
  `Publish window ${window[0]} → ${window.at(-1)} (UTC)${args['dry-run'] ? ' — DRY RUN' : ''}`,
);
for (const a of plan) {
  const detail = 'reason' in a ? `  (${a.reason})` : '';
  console.log(`  ${a.date}  ${a.action}${detail}`);
}

if (!canPublish(plan)) {
  console.error('✗ Invalid bank days above: nothing was published.');
  process.exit(1);
}
if (args['dry-run']) process.exit(0);

let written = 0;
for (const a of plan) {
  if (a.action === 'insert' || a.action === 'update') {
    await store.upsert({ date: a.date, puzzle: a.puzzle });
    written++;
  }
}
console.log(`✓ ${written} day(s) written`);
const missingToday = plan[0]?.action === 'missing';
if (missingToday) {
  console.error(`✗ Today (${window[0]}) has no puzzle: players will see "no puzzle today".`);
  process.exit(1);
}
