import { describe, expect, it } from 'vitest';
import {
  donutSegments,
  heatmapWeeks,
  intensityLevel,
  intensityThresholds,
  sparklinePath,
  weeklyBuckets,
} from './viz-math';

const NOW = new Date('2026-06-10T12:00:00'); // a Wednesday

function ev(iso: string) {
  return { createdAt: iso };
}

describe('weeklyBuckets', () => {
  it('returns one zeroed bucket per week when there are no events', () => {
    expect(weeklyBuckets([], 8, NOW)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('counts an event from today into the newest (last) bucket', () => {
    const counts = weeklyBuckets([ev('2026-06-10T09:00:00')], 8, NOW);
    expect(counts[7]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('buckets by 7-calendar-day windows ending today', () => {
    const counts = weeklyBuckets(
      [
        ev('2026-06-04T23:00:00'), // 6 days ago → newest bucket
        ev('2026-06-03T01:00:00'), // 7 days ago → previous bucket
        ev('2026-05-27T12:00:00'), // 14 days ago → two back
      ],
      8,
      NOW,
    );
    expect(counts[7]).toBe(1);
    expect(counts[6]).toBe(1);
    expect(counts[5]).toBe(1);
  });

  it('drops events older than the window and future events', () => {
    const counts = weeklyBuckets(
      [
        ev('2026-04-15T00:00:00'), // 56 days ago — out of 8-week window
        ev('2026-06-11T00:00:00'), // tomorrow — ignored
      ],
      8,
      NOW,
    );
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('accumulates multiple events in the same week', () => {
    const counts = weeklyBuckets(
      [ev('2026-06-09T08:00:00'), ev('2026-06-08T08:00:00'), ev('2026-06-10T08:00:00')],
      4,
      NOW,
    );
    expect(counts).toEqual([0, 0, 0, 3]);
  });
});

describe('sparklinePath', () => {
  it('returns an empty string for fewer than two points', () => {
    expect(sparklinePath([], 100, 30)).toBe('');
    expect(sparklinePath([3], 100, 30)).toBe('');
  });

  it('spans the full width from left edge to right edge', () => {
    const d = sparklinePath([0, 1, 2], 100, 30, 0);
    expect(d.startsWith('M0,')).toBe(true);
    expect(d).toContain('L100,');
  });

  it('puts the max at the top pad and zero at the bottom pad', () => {
    const d = sparklinePath([0, 4], 100, 40, 5);
    // zero → y = height - pad; max → y = pad
    expect(d).toBe('M0,35 L100,5');
  });

  it('draws a flat baseline when all counts are zero', () => {
    const d = sparklinePath([0, 0, 0], 90, 30, 5);
    expect(d).toBe('M0,25 L45,25 L90,25');
  });
});

describe('heatmapWeeks', () => {
  it('produces a weeks x 7 grid', () => {
    const grid = heatmapWeeks([], 12, NOW);
    expect(grid.length).toBe(12);
    for (const week of grid) expect(week.length).toBe(7);
  });

  it('ends with the week containing today and flags future days', () => {
    const grid = heatmapWeeks([], 12, NOW);
    const last = grid[11];
    // 2026-06-10 is a Wednesday; week starts Sunday 2026-06-07.
    expect(last[0].date).toBe('2026-06-07');
    expect(last[3].date).toBe('2026-06-10');
    expect(last[3].future).toBe(false);
    expect(last[4].future).toBe(true); // Thursday is tomorrow
    expect(last[6].future).toBe(true);
  });

  it('starts 12 weeks back on a Sunday with consecutive days', () => {
    const grid = heatmapWeeks([], 12, NOW);
    expect(grid[0][0].date).toBe('2026-03-22'); // Sunday, 11 weeks before 2026-06-07
    expect(grid[0][1].date).toBe('2026-03-23');
    expect(grid[1][0].date).toBe('2026-03-29');
  });

  it('counts events per calendar day', () => {
    const grid = heatmapWeeks(
      [ev('2026-06-10T01:00:00'), ev('2026-06-10T23:00:00'), ev('2026-06-07T12:00:00')],
      12,
      NOW,
    );
    const last = grid[11];
    expect(last[3].count).toBe(2);
    expect(last[0].count).toBe(1);
    expect(last[1].count).toBe(0);
  });

  it('ignores events before the grid start', () => {
    const grid = heatmapWeeks([ev('2026-03-21T12:00:00')], 12, NOW);
    expect(grid.flat().reduce((a, d) => a + d.count, 0)).toBe(0);
  });
});

describe('intensity quantiles', () => {
  it('returns zero thresholds when every day is empty', () => {
    expect(intensityThresholds([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('derives 25/50/75 quantiles from non-zero counts', () => {
    expect(intensityThresholds([0, 1, 2, 3, 4])).toEqual([1, 2, 3]);
  });

  it('maps counts to levels 0-4 against the thresholds', () => {
    const t = intensityThresholds([0, 1, 2, 3, 4]);
    expect(intensityLevel(0, t)).toBe(0);
    expect(intensityLevel(1, t)).toBe(1);
    expect(intensityLevel(2, t)).toBe(2);
    expect(intensityLevel(3, t)).toBe(3);
    expect(intensityLevel(4, t)).toBe(4);
    expect(intensityLevel(99, t)).toBe(4);
  });

  it('treats any activity as at least level 1 even with degenerate thresholds', () => {
    const t = intensityThresholds([0, 0, 5]);
    expect(t).toEqual([5, 5, 5]);
    expect(intensityLevel(5, t)).toBe(1);
    expect(intensityLevel(6, t)).toBe(4);
  });
});

describe('donutSegments', () => {
  it('splits the circumference proportionally with cumulative offsets', () => {
    const segs = donutSegments([1, 1, 2], 100);
    expect(segs).toEqual([
      { offset: 0, length: 25 },
      { offset: 25, length: 25 },
      { offset: 50, length: 50 },
    ]);
  });

  it('gives zero-length segments for zero values and an all-zero input', () => {
    expect(donutSegments([0, 3, 0], 90)).toEqual([
      { offset: 0, length: 0 },
      { offset: 0, length: 90 },
      { offset: 90, length: 0 },
    ]);
    expect(donutSegments([0, 0], 90)).toEqual([
      { offset: 0, length: 0 },
      { offset: 0, length: 0 },
    ]);
  });
});
