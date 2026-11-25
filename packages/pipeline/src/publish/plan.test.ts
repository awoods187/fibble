import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonical, canPublish, planPublish, puzzleTexts, utcDay } from './plan';

const EXAMPLE = resolve(import.meta.dirname, '../../../../content-example');
const load = async (date: string) =>
  JSON.parse(await readFile(resolve(EXAMPLE, `${date}.json`), 'utf8')) as Record<string, unknown>;

/** A sample day, re-dated and marked as real, so it stands in for a bank day. */
async function bankDay(date: string, edit?: (p: Record<string, unknown>) => void) {
  const p: Record<string, unknown> = { ...(await load('2026-11-24')), date };
  delete p.sample;
  edit?.(p);
  return p;
}

// 2026-11-25 at noon UTC: today is the 25th and the window is 25th–28th.
const NOW = new Date('2026-11-25T12:00:00Z');
const plan = (
  bank: Map<string, unknown>,
  stored = new Map<string, unknown>(),
  allowSample = false,
) => planPublish({ bank, stored, now: NOW, days: 4, allowSample });
const actions = (p: ReturnType<typeof plan>) => p.map((a) => [a.date, a.action]);

describe('planPublish', () => {
  it('inserts new days across the window and reports gaps', async () => {
    const bank = new Map<string, unknown>([
      ['2026-11-25', await bankDay('2026-11-25')],
      ['2026-11-26', await bankDay('2026-11-26')],
    ]);
    expect(actions(plan(bank))).toEqual([
      ['2026-11-25', 'insert'],
      ['2026-11-26', 'insert'],
      ['2026-11-27', 'missing'],
      ['2026-11-28', 'missing'],
    ]);
  });

  it('skips unchanged days, even when the database reordered the JSON keys', async () => {
    const day = await bankDay('2026-11-27');
    const reordered = JSON.parse(canonical(day));
    expect(
      actions(plan(new Map([['2026-11-27', day]]), new Map([['2026-11-27', reordered]])))[2],
    ).toEqual(['2026-11-27', 'unchanged']);
  });

  it('updates a changed future day but never a live one', async () => {
    const edit = (p: Record<string, unknown>) => {
      (p.rounds as { lieNote: string }[])[0]!.lieNote =
        'A changed note that is still one sentence.';
    };
    const bank = new Map<string, unknown>([
      ['2026-11-25', await bankDay('2026-11-25', edit)],
      ['2026-11-28', await bankDay('2026-11-28', edit)],
    ]);
    const stored = new Map<string, unknown>([
      ['2026-11-25', await bankDay('2026-11-25')],
      ['2026-11-28', await bankDay('2026-11-28')],
    ]);
    const p = plan(bank, stored);
    expect(p[0]).toMatchObject({ action: 'blocked-live' });
    expect(p[3]).toMatchObject({ action: 'update' });
  });

  it('treats tomorrow as live once it has begun in UTC+14', async () => {
    const late = new Date('2026-11-25T11:00:00Z'); // 01:00 on the 26th in Kiribati
    const edit = (p: Record<string, unknown>) => {
      (p.rounds as { lieNote: string }[])[0]!.lieNote = 'Edited.';
    };
    const p = planPublish({
      bank: new Map([['2026-11-26', await bankDay('2026-11-26', edit)]]),
      stored: new Map([['2026-11-26', await bankDay('2026-11-26')]]),
      now: late,
      days: 2,
    });
    expect(p[1]).toMatchObject({ date: '2026-11-26', action: 'blocked-live' });
  });

  it('keeps days that are stored but no longer in the bank', async () => {
    expect(
      actions(plan(new Map(), new Map([['2026-11-25', await bankDay('2026-11-25')]])))[0],
    ).toEqual(['2026-11-25', 'stored-only']);
  });

  it.each([
    [
      'a schema failure',
      (p: Record<string, unknown>) => {
        p.rounds = [];
      },
      /schema/,
    ],
    [
      'a date that differs from the file name',
      (p: Record<string, unknown>) => {
        p.date = '2026-12-01';
      },
      /file is for/,
    ],
    [
      'sample content',
      (p: Record<string, unknown>) => {
        p.sample = true;
      },
      /sample/,
    ],
    [
      'a banned topic in a lie note',
      (p: Record<string, unknown>) => {
        (p.rounds as { lieNote: string }[])[0]!.lieNote =
          'Plausible because of the massacre there.';
      },
      /atrocity/,
    ],
  ])('marks a day invalid for %s, and blocks the whole run', async (_name, edit, reason) => {
    const p = plan(new Map([['2026-11-26', await bankDay('2026-11-26', edit)]]));
    expect(p[1]).toMatchObject({ action: 'invalid', reason: expect.stringMatching(reason) });
    expect(canPublish(p)).toBe(false);
  });

  it('publishes sample days only when explicitly allowed (the smoke test)', async () => {
    const sample = await load('2026-11-25');
    expect(plan(new Map([['2026-11-25', sample]]), new Map(), true)[0]).toMatchObject({
      action: 'insert',
    });
  });
});

describe('helpers', () => {
  it('counts UTC days, across a month end', () => {
    expect(utcDay(new Date('2026-11-30T23:30:00Z'), 1)).toBe('2026-12-01');
  });

  it('canonical JSON ignores key order but not values', () => {
    expect(canonical({ b: 1, a: { d: 2, c: 3 } })).toBe(canonical({ a: { c: 3, d: 2 }, b: 1 }));
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
  });

  it('collects every player-visible text', async () => {
    const texts = puzzleTexts((await bankDay('2026-11-25')) as never);
    expect(texts.length).toBeGreaterThan(15);
  });
});
