import { describe, expect, it } from 'vitest';
import {
  isDateArchived,
  isDateReleased,
  isValidDateString,
  puzzleNumber,
  utcDateString,
} from './dates';

describe('isValidDateString', () => {
  it.each(['2026-11-24', '2028-02-29', '2027-12-31'])('accepts %s', (d) => {
    expect(isValidDateString(d)).toBe(true);
  });
  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-1-01', '20261124', '', 'today'])(
    'rejects %s',
    (d) => {
      expect(isValidDateString(d)).toBe(false);
    },
  );
});

describe('isDateReleased', () => {
  // 2026-11-25 starts in UTC+14 at 2026-11-24T10:00:00Z.
  const date = '2026-11-25';

  it('is false one millisecond before the date starts in UTC+14', () => {
    expect(isDateReleased(date, new Date('2026-11-24T09:59:59.999Z'))).toBe(false);
  });

  it('is true at the exact moment the date starts in UTC+14', () => {
    expect(isDateReleased(date, new Date('2026-11-24T10:00:00.000Z'))).toBe(true);
  });

  it('is true for past dates', () => {
    expect(isDateReleased('2020-01-01', new Date('2026-11-24T00:00:00Z'))).toBe(true);
  });

  it('is false for dates days ahead', () => {
    expect(isDateReleased('2026-12-25', new Date('2026-11-24T23:59:59Z'))).toBe(false);
  });

  it('throws on an invalid date', () => {
    expect(() => isDateReleased('2026-02-30', new Date())).toThrow(RangeError);
  });
});

describe('isDateArchived', () => {
  // 2026-11-24 ends in UTC-12 at 2026-11-25T12:00Z; archived 24h later.
  const date = '2026-11-24';

  it('is false while the date is still today somewhere', () => {
    expect(isDateArchived(date, new Date('2026-11-25T11:59:59Z'))).toBe(false);
  });

  it('is false during the one-day grace period', () => {
    expect(isDateArchived(date, new Date('2026-11-26T11:59:59.999Z'))).toBe(false);
  });

  it('is true once the grace period ends', () => {
    expect(isDateArchived(date, new Date('2026-11-26T12:00:00.000Z'))).toBe(true);
  });
});

describe('puzzleNumber', () => {
  it('is 1 on launch day', () => {
    expect(puzzleNumber('2027-01-15', '2027-01-15')).toBe(1);
  });

  it('counts days since launch', () => {
    expect(puzzleNumber('2027-02-25', '2027-01-15')).toBe(42);
  });

  it('crosses a leap day and year boundary', () => {
    expect(puzzleNumber('2029-01-01', '2027-12-31')).toBe(368);
  });

  it('throws before launch', () => {
    expect(() => puzzleNumber('2027-01-14', '2027-01-15')).toThrow(RangeError);
  });
});

describe('utcDateString', () => {
  it('formats the UTC calendar date', () => {
    expect(utcDateString(new Date('2026-11-24T23:30:00-05:00'))).toBe('2026-11-25');
  });
});
