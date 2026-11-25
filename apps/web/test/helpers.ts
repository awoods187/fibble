import { EXAMPLE_CONTENT_DIR } from '@/lib/content';
import { FileContentSource } from '@/lib/content/file-content-source';

/** The sample days, with archive access off so date gating behaves like production. */
export const productionLikeSource = () => new FileContentSource(EXAMPLE_CONTENT_DIR, false);
export const exampleSource = () => new FileContentSource(EXAMPLE_CONTENT_DIR, true);

export const FORBIDDEN_KEYS = ['lieIndex', 'lieNote', 'expansion', 'source', 'sources'];

/** Every object key at any depth of a JSON value. */
export function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, keys));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k);
      allKeys(v, keys);
    }
  }
  return keys;
}

export const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
