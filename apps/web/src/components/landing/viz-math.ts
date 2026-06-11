import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfWeek,
  subDays,
} from 'date-fns';

// Pure client-side math for the mission-control landing viz layer
// (velocity sparkline, horizon arc, pulse heatmap). No DOM, fully unit-tested.

export interface TimedEvent {
  createdAt: string;
}

/**
 * Events per week over the last `weeks` 7-calendar-day windows ending today.
 * Oldest week first, newest (the week containing today) last.
 */
export function weeklyBuckets(
  events: TimedEvent[],
  weeks: number,
  now: Date = new Date(),
): number[] {
  const counts = new Array<number>(weeks).fill(0);
  for (const e of events) {
    const daysAgo = differenceInCalendarDays(now, parseISO(e.createdAt));
    if (daysAgo < 0) continue; // future
    const weeksAgo = Math.floor(daysAgo / 7);
    if (weeksAgo >= weeks) continue; // out of window
    counts[weeks - 1 - weeksAgo] += 1;
  }
  return counts;
}

/** Inline-SVG polyline path for weekly counts; max sits at the top pad. */
export function sparklinePath(
  counts: number[],
  width: number,
  height: number,
  pad = 3,
): string {
  if (counts.length < 2) return '';
  const max = Math.max(...counts);
  const innerH = height - pad * 2;
  const step = width / (counts.length - 1);
  const round = (n: number) => Math.round(n * 100) / 100;
  return counts
    .map((c, i) => {
      const y = max === 0 ? pad + innerH : pad + (1 - c / max) * innerH;
      return `${i === 0 ? 'M' : 'L'}${round(i * step)},${round(y)}`;
    })
    .join(' ');
}

export interface HeatmapDay {
  /** ISO calendar day, e.g. 2026-06-10 */
  date: string;
  count: number;
  /** True for days after today in the trailing partial week. */
  future: boolean;
}

/**
 * GitHub-style calendar grid: `weeks` columns of 7 days (Sunday-first),
 * oldest week first, last column is the week containing `now`.
 */
export function heatmapWeeks(
  events: TimedEvent[],
  weeks = 12,
  now: Date = new Date(),
): HeatmapDay[][] {
  const gridStart = subDays(startOfWeek(now, { weekStartsOn: 0 }), (weeks - 1) * 7);
  const byDay = new Map<string, number>();
  for (const e of events) {
    const key = format(parseISO(e.createdAt), 'yyyy-MM-dd');
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d): HeatmapDay => {
      const day = addDays(gridStart, w * 7 + d);
      const date = format(day, 'yyyy-MM-dd');
      return {
        date,
        count: byDay.get(date) ?? 0,
        future: differenceInCalendarDays(day, now) > 0,
      };
    }),
  );
}

export type IntensityThresholds = [number, number, number];

/** 25/50/75 quantiles of the non-zero day counts — boundaries for levels 1-4. */
export function intensityThresholds(counts: number[]): IntensityThresholds {
  const active = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (active.length === 0) return [0, 0, 0];
  const q = (p: number) => active[Math.max(0, Math.ceil(p * active.length) - 1)];
  return [q(0.25), q(0.5), q(0.75)];
}

/** Maps a day count to an intensity level 0 (none) … 4 (hottest). */
export function intensityLevel(
  count: number,
  [q1, q2, q3]: IntensityThresholds,
): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= q1) return 1;
  if (count <= q2) return 2;
  if (count <= q3) return 3;
  return 4;
}

export interface DonutSegment {
  offset: number;
  length: number;
}

/** Proportional stroke-dash segments around a circle of the given circumference. */
export function donutSegments(values: number[], circumference: number): DonutSegment[] {
  const total = values.reduce((a, b) => a + b, 0);
  let offset = 0;
  return values.map((v) => {
    const length = total === 0 ? 0 : (v / total) * circumference;
    const seg = { offset, length };
    offset += length;
    return seg;
  });
}
