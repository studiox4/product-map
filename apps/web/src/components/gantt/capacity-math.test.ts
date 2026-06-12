import { describe, expect, it } from 'vitest';
import {
  TEAM_SIZE,
  featureLoadWeeks,
  monthCapacityWeeks,
  monthlyLoads,
  spanOverlapsMonth,
  weeksInMonth,
} from './capacity-math';

describe('weeksInMonth', () => {
  it('is daysInMonth / 7', () => {
    expect(weeksInMonth('2026-06-01')).toBeCloseTo(30 / 7, 5); // June
    expect(weeksInMonth('2026-07-01')).toBeCloseTo(31 / 7, 5); // July
    expect(weeksInMonth('2026-02-01')).toBeCloseTo(28 / 7, 5); // Feb (non-leap)
    expect(weeksInMonth('2028-02-01')).toBeCloseTo(29 / 7, 5); // Feb (leap)
  });
});

describe('monthCapacityWeeks', () => {
  it('is 4 teammates x weeks-in-month', () => {
    expect(TEAM_SIZE).toBe(4);
    expect(monthCapacityWeeks('2026-06-01')).toBeCloseTo(4 * (30 / 7), 5);
    expect(monthCapacityWeeks('2026-07-01')).toBeCloseTo(4 * (31 / 7), 5);
  });
});

describe('featureLoadWeeks', () => {
  it('maps s=1, m=3, l=6', () => {
    expect(featureLoadWeeks('s')).toBe(1);
    expect(featureLoadWeeks('m')).toBe(3);
    expect(featureLoadWeeks('l')).toBe(6);
  });

  it('unsized features contribute nothing', () => {
    expect(featureLoadWeeks(null)).toBe(0);
  });
});

describe('spanOverlapsMonth', () => {
  const june = '2026-06-01';

  it('true when the span covers the month', () => {
    expect(spanOverlapsMonth({ startDate: '2026-05-01', endDate: '2026-08-01' }, june)).toBe(true);
  });

  it('true when the span is inside the month', () => {
    expect(spanOverlapsMonth({ startDate: '2026-06-10', endDate: '2026-06-12' }, june)).toBe(true);
  });

  it('true at inclusive boundaries (first/last day)', () => {
    expect(spanOverlapsMonth({ startDate: '2026-05-01', endDate: '2026-06-01' }, june)).toBe(true);
    expect(spanOverlapsMonth({ startDate: '2026-06-30', endDate: '2026-07-15' }, june)).toBe(true);
  });

  it('false when entirely before or after the month', () => {
    expect(spanOverlapsMonth({ startDate: '2026-04-01', endDate: '2026-05-31' }, june)).toBe(false);
    expect(spanOverlapsMonth({ startDate: '2026-07-01', endDate: '2026-07-10' }, june)).toBe(false);
  });

  it('false for incomplete spans', () => {
    expect(spanOverlapsMonth({ startDate: null, endDate: '2026-06-10' }, june)).toBe(false);
    expect(spanOverlapsMonth({ startDate: '2026-06-10', endDate: null }, june)).toBe(false);
  });
});

describe('monthlyLoads', () => {
  it('returns one entry per month in the view window', () => {
    // 2026-06-15 + 60 days → mid-Aug: June, July, August.
    const months = monthlyLoads([], '2026-06-15', 60);
    expect(months.map((m) => m.monthStart)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01']);
    expect(months.map((m) => m.label)).toEqual(['Jun 2026', 'Jul 2026', 'Aug 2026']);
  });

  it('sums size-weeks of every bar overlapping each month', () => {
    const months = monthlyLoads(
      [
        { startDate: '2026-06-01', endDate: '2026-07-10', size: 'l' }, // June + July
        { startDate: '2026-06-05', endDate: '2026-06-20', size: 'm' }, // June only
        { startDate: '2026-07-20', endDate: '2026-07-25', size: 's' }, // July only
        { startDate: '2026-06-10', endDate: '2026-06-12', size: null }, // unsized → 0
      ],
      '2026-06-01',
      60,
    );
    const byMonth = Object.fromEntries(months.map((m) => [m.monthStart, m]));
    expect(byMonth['2026-06-01'].loadWeeks).toBe(9); // 6 + 3
    expect(byMonth['2026-07-01'].loadWeeks).toBe(7); // 6 + 1
  });

  it('flags overcommitted months (load > 4 x weeks-in-month)', () => {
    // June capacity ≈ 17.14w. Three l-features (18w) overlapping June → over.
    const months = monthlyLoads(
      [
        { startDate: '2026-06-01', endDate: '2026-06-30', size: 'l' },
        { startDate: '2026-06-01', endDate: '2026-06-30', size: 'l' },
        { startDate: '2026-06-01', endDate: '2026-06-30', size: 'l' },
      ],
      '2026-06-01',
      30,
    );
    const june = months.find((m) => m.monthStart === '2026-06-01')!;
    expect(june.loadWeeks).toBe(18);
    expect(june.capacityWeeks).toBeCloseTo(4 * (30 / 7), 5);
    expect(june.overcommitted).toBe(true);
  });

  it('does not flag months at or under capacity', () => {
    const months = monthlyLoads(
      [{ startDate: '2026-06-01', endDate: '2026-06-30', size: 'l' }],
      '2026-06-01',
      30,
    );
    expect(months[0].overcommitted).toBe(false);
  });

  it('ignores dateless features', () => {
    const months = monthlyLoads([{ startDate: null, endDate: null, size: 'l' }], '2026-06-01', 30);
    expect(months[0].loadWeeks).toBe(0);
  });
});
