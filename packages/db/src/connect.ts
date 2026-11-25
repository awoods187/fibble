import { neon } from '@neondatabase/serverless';
import type { Sql } from './store';

/**
 * Connection strings come from the environment, never from code or files in either repo.
 * Locally they are 1Password references resolved by `op run`; on Vercel and in GitHub
 * Actions they are platform secrets.
 */

export class MissingSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingSecretError';
  }
}

/** Read a secret from the environment; fail clearly if it's missing or an unresolved reference. */
export function readSecret(
  name: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const value = env[name]?.trim();
  if (!value) throw new MissingSecretError(`${name} is not set.`);
  if (value.startsWith('op://')) {
    throw new MissingSecretError(
      `${name} is a 1Password reference that wasn't resolved. Run the command through ` +
        "`op run --env-file=.env.local -- …` (fibble-content's runner does this for you).",
    );
  }
  return value;
}

/** A query function over HTTP (Neon's serverless driver), suited to Vercel functions. */
export function connect(url: string): Sql {
  return neon(url) as unknown as Sql;
}
