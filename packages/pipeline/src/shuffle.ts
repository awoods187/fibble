import { createHash } from 'node:crypto';

/** Deterministic shuffle (Fisher–Yates driven by a seeded hash), so any run can be reproduced. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j =
      parseInt(createHash('sha256').update(`${seed}:${i}`).digest('hex').slice(0, 8), 16) % (i + 1);
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}
