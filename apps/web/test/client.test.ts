import { emptyStats, newGame, recordCompletion } from '@fibble/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPuzzle, submitAnswer } from '@/lib/client/api';
import {
  isFirstVisit,
  loadGame,
  loadStats,
  markHowToSeen,
  saveGame,
  saveStats,
} from '@/lib/client/storage';

/** A Map-backed localStorage; `broken` makes every call throw, like blocked storage. */
function fakeStorage(broken = false) {
  const m = new Map<string, string>();
  const guard = () => {
    if (broken) throw new Error('SecurityError');
  };
  return {
    map: m,
    getItem: (k: string) => (guard(), m.get(k) ?? null),
    setItem: (k: string, v: string) => (guard(), void m.set(k, v)),
  };
}

describe('client storage', () => {
  let store: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    store = fakeStorage();
    vi.stubGlobal('window', { localStorage: store });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('saves and resumes a game for its date only', () => {
    const g = newGame('2026-11-25', 1);
    saveGame(g);
    expect(loadGame('2026-11-25')).toEqual(g);
    expect(loadGame('2026-11-26')).toBeUndefined();
  });

  it('ignores saved data that is corrupt or the wrong shape', () => {
    store.map.set('fibble:game:2026-11-25', '{not json');
    store.map.set('fibble:stats', JSON.stringify({ played: 'lots' }));
    expect(loadGame('2026-11-25')).toBeUndefined();
    expect(loadStats()).toEqual(emptyStats());
  });

  it('keeps stats and knows a first visit', () => {
    expect(isFirstVisit()).toBe(true);
    markHowToSeen();
    expect(isFirstVisit()).toBe(false);
    const s = recordCompletion(emptyStats(), '2026-11-25', 4);
    saveStats(s);
    expect(loadStats()).toEqual(s);
  });

  it('still works when storage is blocked', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage(true) });
    expect(() => saveGame(newGame('2026-11-25', 1))).not.toThrow();
    expect(loadGame('2026-11-25')).toBeUndefined();
    expect(loadStats()).toEqual(emptyStats());
  });
});

describe('client api', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports a missing day by status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );
    expect(await fetchPuzzle('2026-11-25')).toEqual({ ok: false, status: 404 });
  });

  it('rejects a puzzle reply that carries answers (strict schema)', async () => {
    const leaky = { date: '2026-11-25', puzzleNumber: 1, rounds: [], lieIndex: 0 };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(leaky)),
    );
    await expect(fetchPuzzle('2026-11-25')).rejects.toThrow();
  });

  it('posts only the choice to the round URL', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', f);
    await expect(submitAnswer('2026-11-25', 2, 1)).rejects.toThrow(/HTTP 500/);
    expect(f).toHaveBeenCalledWith(
      '/api/puzzle/2026-11-25/round/2/answer',
      expect.objectContaining({ method: 'POST', body: '{"choice":1}' }),
    );
  });
});
