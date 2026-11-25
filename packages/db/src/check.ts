import type { Sql } from './store';

/**
 * Connection and privilege check for a role (`pnpm db:check`). It reports what the
 * connected role can do to the puzzles table, so a misconfigured secret shows up as
 * "reader can INSERT" rather than as a surprise in production.
 */

export interface RoleReport {
  role: string;
  database: string;
  tableExists: boolean;
  privileges: { select: boolean; insert: boolean; update: boolean; delete: boolean };
  days: number;
}

export type ExpectedRole = 'fibble_reader' | 'fibble_publisher';

const EXPECTED: Record<ExpectedRole, RoleReport['privileges']> = {
  fibble_reader: { select: true, insert: false, update: false, delete: false },
  fibble_publisher: { select: true, insert: true, update: true, delete: false },
};

export async function checkRole(sql: Sql): Promise<RoleReport> {
  const [who] = await sql`SELECT current_user AS role, current_database() AS database,
    to_regclass('public.puzzles') IS NOT NULL AS table_exists`;
  const role = String(who?.role);
  const tableExists = who?.table_exists === true;
  if (!tableExists) {
    return {
      role,
      database: String(who?.database),
      tableExists,
      privileges: { select: false, insert: false, update: false, delete: false },
      days: 0,
    };
  }
  const [p] = await sql`SELECT
    has_table_privilege('public.puzzles', 'SELECT') AS select,
    has_table_privilege('public.puzzles', 'INSERT') AS insert,
    has_table_privilege('public.puzzles', 'UPDATE') AS update,
    has_table_privilege('public.puzzles', 'DELETE') AS delete`;
  const [count] = await sql`SELECT count(*)::int AS days FROM puzzles`;
  return {
    role,
    database: String(who?.database),
    tableExists,
    privileges: {
      select: p?.select === true,
      insert: p?.insert === true,
      update: p?.update === true,
      delete: p?.delete === true,
    },
    days: Number(count?.days ?? 0),
  };
}

/** Problems with a report, for the role it should be. Empty means all good. */
export function problems(report: RoleReport, expected: ExpectedRole): string[] {
  const out: string[] = [];
  if (report.role !== expected) out.push(`connected as ${report.role}, expected ${expected}`);
  if (!report.tableExists)
    out.push('the puzzles table does not exist (run migrations/0001_puzzles.sql)');
  for (const [k, want] of Object.entries(EXPECTED[expected])) {
    const has = report.privileges[k as keyof RoleReport['privileges']];
    if (has !== want)
      out.push(
        `${k.toUpperCase()} is ${has ? 'allowed' : 'not allowed'}; it should ${want ? 'be' : 'not be'}`,
      );
  }
  return out;
}
