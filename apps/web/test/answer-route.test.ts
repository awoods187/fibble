import { AnswerResultSchema } from '@fibble/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/puzzle/[date]/round/[n]/answer/route';
import { exampleSource } from './helpers';
import { params } from './helpers';

const post = (date: string, n: string, body: unknown) =>
  POST(
    new Request(`http://test/api/puzzle/${date}/round/${n}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    params({ date, n }),
  );

describe('POST /api/puzzle/[date]/round/[n]/answer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('marks the lie as correct and reveals sources for the truths', async () => {
    const puzzle = (await exampleSource().getPuzzle('2026-11-24'))!;
    const lieIndex = puzzle.rounds[0]!.lieIndex;
    const res = await post('2026-11-24', '1', { choice: lieIndex });
    expect(res.status).toBe(200);
    const body = AnswerResultSchema.parse(await res.json());
    expect(body).toMatchObject({ round: 1, correct: true, lieIndex, choice: lieIndex });
    expect(body.truths).toHaveLength(2);
    expect(body.truths.every((t) => t.source.url.startsWith('https://en.wikipedia.org/'))).toBe(
      true,
    );
  });

  it('marks a truth as wrong', async () => {
    const puzzle = (await exampleSource().getPuzzle('2026-11-24'))!;
    const lieIndex = puzzle.rounds[2]!.lieIndex;
    const truth = ([0, 1, 2] as const).find((i) => i !== lieIndex)!;
    const body = await (await post('2026-11-24', '3', { choice: truth })).json();
    expect(body).toMatchObject({ round: 3, correct: false, lieIndex });
  });

  it('refuses a future date with 404', async () => {
    expect((await post('2026-11-26', '1', { choice: 0 })).status).toBe(404);
  });

  it.each(['0', '6', '1.5', 'one', '01'])('rejects round "%s" with 400', async (n) => {
    expect((await post('2026-11-24', n, { choice: 0 })).status).toBe(400);
  });

  it.each([{ choice: 3 }, { choice: '1' }, {}, { choice: 0, extra: true }, 'not json'])(
    'rejects body %j with 400',
    async (body) => {
      expect((await post('2026-11-24', '1', body)).status).toBe(400);
    },
  );
});
