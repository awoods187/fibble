import { resolve } from 'node:path';
import type { ContentSource } from './content-source';
import { FileContentSource } from './file-content-source';

export type { ContentSource } from './content-source';
export { FileContentSource } from './file-content-source';

/** content-example/ at the repo root, relative to apps/web. */
export const EXAMPLE_CONTENT_DIR = resolve(process.cwd(), '../../content-example');

let source: ContentSource | undefined;

/**
 * The app's content source. Until the Postgres source exists this is always
 * the sample content, which has archive access on so past sample days load.
 */
export function getContentSource(): ContentSource {
  source ??= new FileContentSource(process.env.FIBBLE_CONTENT_DIR ?? EXAMPLE_CONTENT_DIR, true);
  return source;
}
