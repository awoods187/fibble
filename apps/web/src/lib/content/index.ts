import { resolve } from 'node:path';
import { connect, PuzzleStore, readSecret } from '@fibble/db';
import type { ContentSource } from './content-source';
import { FileContentSource } from './file-content-source';
import { PostgresContentSource } from './postgres-content-source';

export type { ContentSource } from './content-source';
export { FileContentSource } from './file-content-source';
export { PostgresContentSource } from './postgres-content-source';

/** content-example/ at the repo root, relative to apps/web. */
export const EXAMPLE_CONTENT_DIR = resolve(process.cwd(), '../../content-example');

let source: ContentSource | undefined;

/**
 * The app's content source:
 * - `DATABASE_URL` set (production on Vercel): published days from Postgres, read-only.
 * - otherwise (local development, previews, tests): files, from `FIBBLE_CONTENT_DIR` or the
 *   sample days, with archive access so past sample days still load.
 */
export function chooseContentSource(
  env: Record<string, string | undefined> = process.env,
): ContentSource {
  if (env.DATABASE_URL) {
    return new PostgresContentSource(new PuzzleStore(connect(readSecret('DATABASE_URL', env))));
  }
  return new FileContentSource(env.FIBBLE_CONTENT_DIR ?? EXAMPLE_CONTENT_DIR, true);
}

export function getContentSource(): ContentSource {
  source ??= chooseContentSource();
  return source;
}
