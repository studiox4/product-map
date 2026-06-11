import { addMonths, format, startOfMonth } from 'date-fns';
import type {
  ActivityKind,
  DatesChangedPayload,
  FeatureStatus,
  Horizon,
  HorizonChangedPayload,
  StatusChangedPayload,
} from '@productmap/shared';

// Pure state-reconstruction for the Roadmap Time Machine (Spec 2.1).
// We replay BACKWARD from the current ("now") state: walking the activity
// list newest → oldest, every event that happened AFTER the scrub time is
// undone using its from-values. No writes, no fetching — pure functions only.

/** Minimal activity shape the replay needs (WorkspaceActivityItem satisfies it). */
export interface ReplayEvent {
  featureId: string;
  kind: ActivityKind;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

/** The slice of a feature the Time Machine can change while scrubbing. */
export interface FeatureReplaySnapshot {
  id: string;
  title: string;
  horizon: Horizon;
  status: FeatureStatus;
  startDate: string | null;
  endDate: string | null;
}

function toMs(t: string | number | Date): number {
  return typeof t === 'number' ? t : new Date(t).getTime();
}

/**
 * Reconstruct feature snapshots as of `atTime`, given the current state and the
 * full ascending activity list. Events after `atTime` are undone in reverse:
 * - feature_created → the feature didn't exist yet → removed
 * - horizon_changed / status_changed / dates_changed → from-values restored
 * Unknown feature ids and non-roadmap kinds are ignored. Malformed payloads
 * are skipped rather than thrown — history scrubbing must never crash the UI.
 */
export function reconstructState(
  current: readonly FeatureReplaySnapshot[],
  events: readonly ReplayEvent[],
  atTime: string | number | Date,
): FeatureReplaySnapshot[] {
  const atMs = toMs(atTime);
  const byId = new Map(current.map((f) => [f.id, { ...f }]));

  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (toMs(e.createdAt) <= atMs) break; // ascending input → everything earlier already applies
    const f = byId.get(e.featureId);
    if (!f) continue;
    switch (e.kind) {
      case 'feature_created':
        byId.delete(e.featureId);
        break;
      case 'horizon_changed': {
        const from = (e.payload as Partial<HorizonChangedPayload> | null)?.from;
        if (from) f.horizon = from;
        break;
      }
      case 'status_changed': {
        const from = (e.payload as Partial<StatusChangedPayload> | null)?.from;
        if (from) f.status = from;
        break;
      }
      case 'dates_changed': {
        const from = (e.payload as Partial<DatesChangedPayload> | null)?.from;
        if (from) {
          f.startDate = from.startDate ?? null;
          f.endDate = from.endDate ?? null;
        }
        break;
      }
      default:
        break; // doc/comment/description events don't affect roadmap geometry
    }
  }

  return current.filter((f) => byId.has(f.id)).map((f) => byId.get(f.id)!);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Scrub range: earliest event → now. Empty history falls back to a 90-day window. */
export function timelineRange(
  events: readonly Pick<ReplayEvent, 'createdAt'>[],
  now: number = Date.now(),
): { start: number; end: number } {
  if (events.length === 0) return { start: now - 90 * DAY_MS, end: now };
  const start = Math.min(...events.map((e) => toMs(e.createdAt)), now);
  return { start, end: now };
}

/** Month boundaries strictly inside (start, end), as percent offsets for tick rendering. */
export function monthMarks(startMs: number, endMs: number): { pct: number; label: string }[] {
  const span = endMs - startMs;
  if (span <= 0) return [];
  const marks: { pct: number; label: string }[] = [];
  let m = startOfMonth(new Date(startMs));
  if (m.getTime() <= startMs) m = addMonths(m, 1);
  while (m.getTime() < endMs) {
    marks.push({ pct: ((m.getTime() - startMs) / span) * 100, label: format(m, 'MMM') });
    m = addMonths(m, 1);
  }
  return marks;
}

/** Event counts per equal time bucket (for the density dots under the scrub track). */
export function densityBuckets(
  events: readonly Pick<ReplayEvent, 'createdAt'>[],
  startMs: number,
  endMs: number,
  bucketCount: number,
): number[] {
  const counts = new Array<number>(bucketCount).fill(0);
  const span = endMs - startMs;
  if (span <= 0 || bucketCount <= 0) return counts;
  for (const e of events) {
    const t = toMs(e.createdAt);
    const idx = Math.min(Math.max(Math.floor(((t - startMs) / span) * bucketCount), 0), bucketCount - 1);
    counts[idx] += 1;
  }
  return counts;
}
