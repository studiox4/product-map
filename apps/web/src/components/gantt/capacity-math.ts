// Pure capacity math for the roadmap capacity strip (Dream Tier D6).
// Heuristic from the spec: each feature costs SIZE_WEEKS[size] weeks
// (s=1, m=3, l=6), summed over every month its bar overlaps; monthly
// capacity is TEAM_SIZE teammates x weeks-in-month. No endpoint — client only.
import {
  addDays,
  format,
  getDaysInMonth,
  lastDayOfMonth,
  parseISO,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import { SIZE_WEEKS, type FeatureSize } from '@productmap/shared';
import type { DateSpan } from './gantt-math';

export const TEAM_SIZE = 4;

export interface SizedSpan extends DateSpan {
  size: FeatureSize | null;
}

export interface MonthLoad {
  /** First of the month, ISO yyyy-MM-dd. */
  monthStart: string;
  /** e.g. "Jun 2026" — matches the gantt header tick labels. */
  label: string;
  /** Days in the month (for strip geometry). */
  days: number;
  loadWeeks: number;
  capacityWeeks: number;
  overcommitted: boolean;
}

function toDate(d: string | Date): Date {
  return startOfDay(typeof d === 'string' ? parseISO(d) : d);
}

/** Fractional weeks in a calendar month (daysInMonth / 7). */
export function weeksInMonth(monthStart: string | Date): number {
  return getDaysInMonth(toDate(monthStart)) / 7;
}

/** Monthly capacity in weeks: TEAM_SIZE teammates x weeks-in-month. */
export function monthCapacityWeeks(monthStart: string | Date): number {
  return TEAM_SIZE * weeksInMonth(monthStart);
}

/** Weeks of load a feature contributes to each month it overlaps. */
export function featureLoadWeeks(size: FeatureSize | null): number {
  return size ? SIZE_WEEKS[size] : 0;
}

/** Inclusive overlap test between a date span and a calendar month. */
export function spanOverlapsMonth(span: DateSpan, monthStart: string | Date): boolean {
  if (!span.startDate || !span.endDate) return false;
  const mStart = startOfMonth(toDate(monthStart));
  const mEnd = lastDayOfMonth(mStart);
  return toDate(span.startDate) <= mEnd && toDate(span.endDate) >= mStart;
}

/**
 * Per-month load vs capacity for every calendar month intersecting the view
 * window (viewStart .. viewStart + totalDays), in chronological order.
 */
export function monthlyLoads(
  spans: SizedSpan[],
  viewStart: string | Date,
  totalDays: number,
): MonthLoad[] {
  const start = toDate(viewStart);
  const end = addDays(start, totalDays);
  const months: MonthLoad[] = [];
  let m = startOfMonth(start);
  while (m < end) {
    const loadWeeks = spans.reduce(
      (sum, s) => sum + (spanOverlapsMonth(s, m) ? featureLoadWeeks(s.size) : 0),
      0,
    );
    const capacityWeeks = monthCapacityWeeks(m);
    months.push({
      monthStart: format(m, 'yyyy-MM-dd'),
      label: format(m, 'MMM yyyy'),
      days: getDaysInMonth(m),
      loadWeeks,
      capacityWeeks,
      overcommitted: loadWeeks > capacityWeeks,
    });
    m = startOfMonth(addDays(lastDayOfMonth(m), 1));
  }
  return months;
}
