import { PublicPuzzleSchema } from '@fibble/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/puzzle/[date]/route';
import { handleGetPuzzle } from '@/lib/puzzle-service';
import { allKeys, FORBIDDEN_KEYS, params, productionLikeSource } from './helpers';

const get = (date: string) => GET(new Request(`http://test/api/puzzle/${date}`), params({ date }));

describe('GET /api/puzzle/[date] (route)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-11-25 starts in UTC+14 at 2026-11-24T10:00Z, so at 12:00Z days 1 and 2 are out.
    vi.setSystemTime(new Date('2026-11-24T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns a valid PublicPuzzle for a released date', async () => {
    const res = await get('2026-11-24');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(PublicPuzzleSchema.safeParse(body).success).toBe(true);
    expect(body.rounds).toHaveLength(5);
  });

  it.each(['2026-11-24', '2026-11-25'])('never returns answer fields (%s)', async (date) => {
    const body = await (await get(date)).json();
    const keys = allKeys(body);
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k), `leaked "${k}"`).toBe(false);
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/wikipedia\.org|revisionId|\[SAMPLE\] Why|Plausible because/);
  });

  it('refuses a future date with 404', async () => {
    const res = await get('2026-11-26');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'No puzzle for this date' });
  });

  it('answers a future date and a missing date identically', async () => {
    const future = await (await get('2026-11-26')).json();
    const missing = await (await get('2026-11-23')).json();
    expect(future).toEqual(missing);
  });

  it('rejects a malformed date with 400', async () => {
    expect((await get('../../etc/passwd')).status).toBe(400);
    expect((await get('2026-02-30')).status).toBe(400);
  });

  it('is not cacheable', async () => {
    expect((await get('2026-11-24')).headers.get('cache-control')).toBe('no-store');
  });
});

describe('handleGetPuzzle date gate', () => {
  const source = productionLikeSource();

  it('releases a date at the exact moment it starts in UTC+14', async () => {
    const before = await handleGetPuzzle(
      source,
      '2026-11-26',
      new Date('2026-11-25T09:59:59.999Z'),
    );
    const at = await handleGetPuzzle(source, '2026-11-26', new Date('2026-11-25T10:00:00.000Z'));
    expect(before.status).toBe(404);
    expect(at.status).toBe(200);
  });

  it('refuses dates more than 1 day old when archive access is off', async () => {
    const res = await handleGetPuzzle(source, '2026-11-24', new Date('2026-11-26T12:00:00Z'));
    expect(res.status).toBe(404);
  });
});
