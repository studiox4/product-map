import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  max as maxDate,
  min as minDate,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

// Gantt geometry (px values are exempt from the Tailwind spacing scale per UX guidelines)
export const PX_PER_DAY = 4;
export const GUTTER_WIDTH = 200;
export const ROW_HEIGHT = 36;
export const BAR_HEIGHT = 20;
export const HEADER_HEIGHT = 40;
export const MIN_BAR_DAYS = 1;
/** Pointer movement below this (px) counts as a click, not a drag. */
export const CLICK_TOLERANCE_PX = 5;

const ISO = 'yyyy-MM-dd';

function toDate(d: string | Date): Date {
  return startOfDay(typeof d === 'string' ? parseISO(d) : d);
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DateSpan {
  startDate: string | null;
  endDate: string | null;
}

/** X position (px) of a date relative to the view start. */
export function dateToX(date: string | Date, viewStart: string | Date, pxPerDay: number): number {
  return differenceInCalendarDays(toDate(date), toDate(viewStart)) * pxPerDay;
}

/** Inverse of dateToX, snapped to the nearest whole day. Returns ISO yyyy-MM-dd. */
export function xToDate(x: number, viewStart: string | Date, pxPerDay: number): string {
  const days = Math.round(x / pxPerDay);
  return format(addDays(toDate(viewStart), days), ISO);
}

/**
 * Rect for a feature bar. End date is inclusive (a 1-day feature is pxPerDay wide).
 * Returns null when the feature has no complete date span.
 */
export function barRect(
  span: DateSpan,
  viewStart: string | Date,
  pxPerDay: number,
  rowIndex: number,
  rowHeight: number = ROW_HEIGHT,
  barHeight: number = BAR_HEIGHT,
): Rect | null {
  if (!span.startDate || !span.endDate) return null;
  const days = Math.max(
    differenceInCalendarDays(toDate(span.endDate), toDate(span.startDate)) + 1,
    MIN_BAR_DAYS,
  );
  return {
    x: dateToX(span.startDate, viewStart, pxPerDay),
    y: rowIndex * rowHeight + (rowHeight - barHeight) / 2,
    width: days * pxPerDay,
    height: barHeight,
  };
}

/** Snap a pixel drag delta to whole days, optionally clamped (e.g. resize keeps >= 1 day). */
export function clampDrag(
  deltaX: number,
  pxPerDay: number,
  opts: { minDeltaDays?: number; maxDeltaDays?: number } = {},
): number {
  let days = Math.round(deltaX / pxPerDay);
  if (opts.minDeltaDays !== undefined) days = Math.max(days, opts.minDeltaDays);
  if (opts.maxDeltaDays !== undefined) days = Math.min(days, opts.maxDeltaDays);
  return days;
}

/** Shift both dates of a span by a whole number of days. */
export function shiftDates(
  startDate: string,
  endDate: string,
  days: number,
): { startDate: string; endDate: string } {
  return {
    startDate: format(addDays(toDate(startDate), days), ISO),
    endDate: format(addDays(toDate(endDate), days), ISO),
  };
}

/**
 * View window: starts 7 days before the earliest of (today, min startDate),
 * spans at least ~6 months and at least 14 days past the latest end date.
 */
export function computeViewRange(
  spans: DateSpan[],
  today: Date = new Date(),
): { viewStart: string; totalDays: number } {
  const starts = spans.filter((s) => s.startDate).map((s) => toDate(s.startDate!));
  const ends = spans.filter((s) => s.endDate).map((s) => toDate(s.endDate!));
  const earliest = minDate([toDate(today), ...starts]);
  const viewStartDate = addDays(earliest, -7);
  const latest = maxDate([toDate(today), ...ends]);
  const totalDays = Math.max(
    183, // ~6 months at PX_PER_DAY=4
    differenceInCalendarDays(addDays(latest, 14), viewStartDate),
  );
  return { viewStart: format(viewStartDate, ISO), totalDays };
}

/** Month-start ticks visible within the view window. */
export function monthTicks(
  viewStart: string | Date,
  totalDays: number,
  pxPerDay: number,
): { x: number; label: string }[] {
  const start = toDate(viewStart);
  const end = addDays(start, totalDays);
  const ticks: { x: number; label: string }[] = [];
  let m = startOfMonth(start);
  if (m < start) m = addMonths(m, 1);
  while (m < end) {
    ticks.push({ x: dateToX(m, start, pxPerDay), label: format(m, 'MMM yyyy') });
    m = addMonths(m, 1);
  }
  return ticks;
}

/** X positions of week starts (Mondays) strictly inside the view window. */
export function weekTicks(viewStart: string | Date, totalDays: number, pxPerDay: number): number[] {
  const start = toDate(viewStart);
  const end = addDays(start, totalDays);
  const xs: number[] = [];
  let w = startOfWeek(start, { weekStartsOn: 1 });
  while (w <= start) w = addDays(w, 7);
  while (w <= end) {
    xs.push(dateToX(w, start, pxPerDay));
    w = addDays(w, 7);
  }
  return xs;
}
