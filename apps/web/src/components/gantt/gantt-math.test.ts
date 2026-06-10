import { describe, expect, it } from 'vitest';
import {
  BAR_HEIGHT,
  GUTTER_WIDTH,
  MIN_BAR_DAYS,
  PX_PER_DAY,
  ROW_HEIGHT,
  barRect,
  clampDrag,
  computeViewRange,
  dateToX,
  monthTicks,
  shiftDates,
  weekTicks,
  xToDate,
} from './gantt-math';

const VIEW_START = '2026-06-01';

describe('dateToX', () => {
  it('returns 0 for the view start itself', () => {
    expect(dateToX('2026-06-01', VIEW_START, 4)).toBe(0);
  });

  it('scales by pxPerDay', () => {
    expect(dateToX('2026-06-11', VIEW_START, 4)).toBe(40);
    expect(dateToX('2026-06-11', VIEW_START, 8)).toBe(80);
  });

  it('is negative for dates before view start', () => {
    expect(dateToX('2026-05-31', VIEW_START, 4)).toBe(-4);
  });

  it('positions the today-line correctly', () => {
    // today-line is just dateToX(today): 8 days into view at 4px/day = 32px
    expect(dateToX('2026-06-09', VIEW_START, PX_PER_DAY)).toBe(32);
  });
});

describe('xToDate', () => {
  it('maps exact day boundaries back to dates', () => {
    expect(xToDate(0, VIEW_START, 4)).toBe('2026-06-01');
    expect(xToDate(40, VIEW_START, 4)).toBe('2026-06-11');
  });

  it('snaps to the nearest day', () => {
    expect(xToDate(39, VIEW_START, 4)).toBe('2026-06-11'); // 9.75 -> 10
    expect(xToDate(41, VIEW_START, 4)).toBe('2026-06-11'); // 10.25 -> 10
    expect(xToDate(43, VIEW_START, 4)).toBe('2026-06-12'); // 10.75 -> 11
  });

  it('round-trips with dateToX', () => {
    const x = dateToX('2026-08-15', VIEW_START, 4);
    expect(xToDate(x, VIEW_START, 4)).toBe('2026-08-15');
  });
});

describe('barRect', () => {
  it('computes x/width from dates (end date inclusive)', () => {
    const r = barRect(
      { startDate: '2026-06-01', endDate: '2026-06-10' },
      VIEW_START,
      4,
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.x).toBe(0);
    expect(r!.width).toBe(40); // 10 inclusive days * 4px
  });

  it('enforces a minimum width of 1 day', () => {
    const r = barRect(
      { startDate: '2026-06-05', endDate: '2026-06-05' },
      VIEW_START,
      4,
      0,
    );
    expect(r!.width).toBe(MIN_BAR_DAYS * 4);
  });

  it('positions vertically by row index, centered in the row', () => {
    const r = barRect(
      { startDate: '2026-06-01', endDate: '2026-06-02' },
      VIEW_START,
      4,
      3,
    );
    expect(r!.y).toBe(3 * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2);
    expect(r!.height).toBe(BAR_HEIGHT);
  });

  it('returns null for dateless features', () => {
    expect(barRect({ startDate: null, endDate: null }, VIEW_START, 4, 0)).toBeNull();
    expect(barRect({ startDate: '2026-06-01', endDate: null }, VIEW_START, 4, 0)).toBeNull();
  });
});

describe('clampDrag', () => {
  it('snaps a pixel delta to whole days', () => {
    expect(clampDrag(120, 4)).toBe(30);
    expect(clampDrag(122, 4)).toBe(31); // 30.5 rounds away from zero-ish via Math.round
    expect(clampDrag(-7, 4)).toBe(-2);
    expect(clampDrag(1, 4)).toBe(0);
  });

  it('clamps to provided bounds (e.g. resize keeps >= 1 day)', () => {
    // bar currently 5 days long: resize cannot shrink past -(5 - MIN_BAR_DAYS)
    expect(clampDrag(-100, 4, { minDeltaDays: -(5 - MIN_BAR_DAYS) })).toBe(-4);
    expect(clampDrag(100, 4, { maxDeltaDays: 10 })).toBe(10);
  });
});

describe('shiftDates', () => {
  it('shifts both dates by whole days across month boundaries', () => {
    expect(shiftDates('2026-06-01', '2026-06-10', 30)).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-10',
    });
    expect(shiftDates('2026-06-01', '2026-06-10', -1)).toEqual({
      startDate: '2026-05-31',
      endDate: '2026-06-09',
    });
  });
});

describe('computeViewRange', () => {
  it('starts 7 days before the earliest date and spans at least ~6 months', () => {
    const { viewStart, totalDays } = computeViewRange(
      [{ startDate: '2026-06-10', endDate: '2026-06-20' }],
      new Date('2026-06-09T12:00:00'),
    );
    expect(viewStart).toBe('2026-06-02'); // today (earlier than min start) - 7d
    expect(totalDays).toBeGreaterThanOrEqual(180);
  });

  it('extends past the latest end date', () => {
    const { viewStart, totalDays } = computeViewRange(
      [{ startDate: '2026-06-10', endDate: '2027-02-01' }],
      new Date('2026-06-09T12:00:00'),
    );
    const lastX = dateToX('2027-02-01', viewStart, 1);
    expect(totalDays).toBeGreaterThan(lastX);
  });

  it('handles no dated features by centering on today', () => {
    const { viewStart } = computeViewRange([], new Date('2026-06-09T12:00:00'));
    expect(viewStart).toBe('2026-06-02');
  });
});

describe('ticks', () => {
  it('monthTicks yields one tick per month start with labels', () => {
    const ticks = monthTicks('2026-06-15', 60, 4);
    // months starting within (june 15 + 60d): jul 1, aug 1
    expect(ticks.map((t) => t.label)).toEqual(['Jul 2026', 'Aug 2026']);
    expect(ticks[0].x).toBe(dateToX('2026-07-01', '2026-06-15', 4));
  });

  it('weekTicks yields x positions for each week start', () => {
    const xs = weekTicks('2026-06-01', 21, 4); // 2026-06-01 is a Monday
    expect(xs).toEqual([
      dateToX('2026-06-08', '2026-06-01', 4),
      dateToX('2026-06-15', '2026-06-01', 4),
      dateToX('2026-06-22', '2026-06-01', 4),
    ]);
  });
});

describe('constants', () => {
  it('uses the plan geometry', () => {
    expect(PX_PER_DAY).toBe(4);
    expect(GUTTER_WIDTH).toBe(200);
  });
});
