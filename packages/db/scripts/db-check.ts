/**
 * Check a database connection and what its role may do. Prints no secrets.
 *
 *   pnpm db:check --role publisher   # uses DATABASE_URL_PUBLISHER
 *   pnpm db:check --role reader      # uses DATABASE_URL
 *
 * Run it through `op run` when the variable is a 1Password reference, e.g. from
 * fibble-content: `pnpm db:check --role publisher` (its runner wraps op run).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { checkRole, type ExpectedRole, problems } from '../src/check';
import { connect, readSecret } from '../src/connect';

const base = process.env.INIT_CWD ?? process.cwd();
const { values } = parseArgs({
  options: { role: { type: 'string' }, 'env-file': { type: 'string', default: '.env.local' } },
});
const roles: Record<string, { env: string; expected: ExpectedRole }> = {
  reader: { env: 'DATABASE_URL', expected: 'fibble_reader' },
  publisher: { env: 'DATABASE_URL_PUBLISHER', expected: 'fibble_publisher' },
};
const role = roles[values.role ?? ''];
if (!role) {
  console.error('Usage: pnpm db:check --role reader|publisher');
  process.exit(1);
}
const envFile = resolve(base, values['env-file'] ?? '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

try {
  const report = await checkRole(connect(readSecret(role.env)));
  const issues = problems(report, role.expected);
  const p = report.privileges;
  console.log(`Connected as ${report.role} to ${report.database}`);
  console.log(
    `  puzzles table: ${report.tableExists ? 'present' : 'MISSING'}; days stored: ${report.days}`,
  );
  console.log(
    `  SELECT ${p.select} · INSERT ${p.insert} · UPDATE ${p.update} · DELETE ${p.delete}`,
  );
  if (issues.length) {
    console.error(`✗ ${issues.length} problem(s):`);
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log(`✓ ${role.expected} is set up correctly`);
} catch (e) {
  // Driver errors can echo parts of the URL; print only the error class and a safe message.
  const message =
    e instanceof Error
      ? e.message.replace(/postgres(ql)?:\/\/\S+/g, '<connection string>')
      : String(e);
  console.error(`✗ Could not check the connection: ${message}`);
  process.exit(1);
}
