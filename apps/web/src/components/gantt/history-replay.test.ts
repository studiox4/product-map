// @vitest-environment jsdom
// Pure replay math for the Roadmap Time Machine (Spec 2.1) + a component-level
// check that scrubbed snapshots render historical bar positions in the Gantt.
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import type { Feature } from '@productmap/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { GanttChart } from './GanttChart';
import { PX_PER_DAY, dateToX } from './gantt-math';
import {
  type ReplayEvent,
  densityBuckets,
  monthMarks,
  reconstructState,
  timelineRange,
} from './history-replay';

function event(overrides: Partial<ReplayEvent> & Pick<ReplayEvent, 'kind' | 'createdAt'>): ReplayEvent {
  return { featureId: 'f1', payload: null, ...overrides };
}

const baseNow = [
  {
    id: 'f1',
    title: 'Rich markdown editor',
    horizon: 'now' as const,
    status: 'in_progress' as const,
    startDate: '2026-06-01',
    endDate: '2026-06-15',
  },
  {
    id: 'f2',
    title: 'Gantt roadmap',
    horizon: 'next' as const,
    status: 'planned' as const,
    startDate: '2026-07-01',
    endDate: '2026-07-20',
  },
];

describe('reconstructState', () => {
  it('returns current state unchanged when scrubbed to now (no events after atTime)', () => {
    const events = [
      event({ kind: 'dates_changed', createdAt: '2026-05-01T10:00:00Z', payload: {
        from: { startDate: '2026-05-20', endDate: '2026-06-03' },
        to: { startDate: '2026-06-01', endDate: '2026-06-15' },
      } }),
    ];
    expect(reconstructState(baseNow, events, '2026-06-09T00:00:00Z')).toEqual(baseNow);
  });

  it('undoes a dates_changed event by restoring the from-span', () => {
    const events = [
      event({ kind: 'dates_changed', createdAt: '2026-06-05T10:00:00Z', payload: {
        from: { startDate: '2026-05-20', endDate: '2026-06-03' },
        to: { startDate: '2026-06-01', endDate: '2026-06-15' },
      } }),
    ];
    const state = reconstructState(baseNow, events, '2026-06-01T00:00:00Z');
    expect(state.find((f) => f.id === 'f1')).toMatchObject({
      startDate: '2026-05-20',
      endDate: '2026-06-03',
    });
    // f2 untouched
    expect(state.find((f) => f.id === 'f2')).toMatchObject({ startDate: '2026-07-01' });
  });

  it('undoes horizon and status changes via from-values', () => {
    const events = [
      event({ kind: 'horizon_changed', createdAt: '2026-05-10T10:00:00Z', payload: { from: 'later', to: 'next' } }),
      event({ kind: 'horizon_changed', createdAt: '2026-06-02T10:00:00Z', payload: { from: 'next', to: 'now' } }),
      event({ kind: 'status_changed', createdAt: '2026-06-03T10:00:00Z', payload: { from: 'planned', to: 'in_progress' } }),
    ];
    // Between the two horizon changes: only the later pair undone.
    const mid = reconstructState(baseNow, events, '2026-05-15T00:00:00Z');
    expect(mid.find((f) => f.id === 'f1')).toMatchObject({ horizon: 'next', status: 'planned' });
    // Before everything: fully unwound.
    const early = reconstructState(baseNow, events, '2026-05-01T00:00:00Z');
    expect(early.find((f) => f.id === 'f1')).toMatchObject({ horizon: 'later', status: 'planned' });
  });

  it('removes a feature before its feature_created event', () => {
    const events = [
      event({ kind: 'feature_created', featureId: 'f2', createdAt: '2026-06-01T10:00:00Z', payload: {
        to: 'Gantt roadmap',
        snapshot: { title: 'Gantt roadmap', horizon: 'next', status: 'planned', startDate: null, endDate: null },
      } }),
    ];
    const before = reconstructState(baseNow, events, '2026-05-30T00:00:00Z');
    expect(before.map((f) => f.id)).toEqual(['f1']);
    const after = reconstructState(baseNow, events, '2026-06-02T00:00:00Z');
    expect(after.map((f) => f.id)).toEqual(['f1', 'f2']);
  });

  it('replays a full backward chain in reverse order and ignores unrelated kinds', () => {
    const events = [
      event({ kind: 'feature_created', createdAt: '2026-04-01T10:00:00Z', payload: {
        to: 'Rich markdown editor',
        snapshot: { title: 'Rich markdown editor', horizon: 'later', status: 'idea', startDate: null, endDate: null },
      } }),
      event({ kind: 'comment_added', createdAt: '2026-04-02T10:00:00Z' }),
      event({ kind: 'dates_changed', createdAt: '2026-05-01T10:00:00Z', payload: {
        from: { startDate: null, endDate: null },
        to: { startDate: '2026-06-01', endDate: '2026-06-15' },
      } }),
      event({ kind: 'horizon_changed', createdAt: '2026-05-02T10:00:00Z', payload: { from: 'later', to: 'now' } }),
      event({ kind: 'status_changed', createdAt: '2026-05-03T10:00:00Z', payload: { from: 'idea', to: 'in_progress' } }),
    ];
    const state = reconstructState(baseNow, events, '2026-04-15T00:00:00Z');
    expect(state.find((f) => f.id === 'f1')).toMatchObject({
      horizon: 'later',
      status: 'idea',
      startDate: null,
      endDate: null,
    });
    // Events for features missing from the base list are ignored safely.
    const ghost = [event({ kind: 'horizon_changed', featureId: 'nope', createdAt: '2026-06-05T00:00:00Z', payload: { from: 'now', to: 'later' } })];
    expect(reconstructState(baseNow, ghost, '2026-06-01T00:00:00Z')).toEqual(baseNow);
  });

  it('handles malformed payloads without throwing', () => {
    const events = [
      event({ kind: 'dates_changed', createdAt: '2026-06-05T10:00:00Z', payload: null }),
      event({ kind: 'horizon_changed', createdAt: '2026-06-06T10:00:00Z', payload: {} }),
    ];
    expect(() => reconstructState(baseNow, events, '2026-06-01T00:00:00Z')).not.toThrow();
  });
});

describe('timelineRange', () => {
  it('spans the earliest event to now', () => {
    const events = [
      event({ kind: 'feature_created', createdAt: '2026-03-10T08:00:00Z' }),
      event({ kind: 'dates_changed', createdAt: '2026-06-01T08:00:00Z' }),
    ];
    const now = Date.parse('2026-06-09T12:00:00Z');
    const range = timelineRange(events, now);
    expect(range.start).toBe(Date.parse('2026-03-10T08:00:00Z'));
    expect(range.end).toBe(now);
  });

  it('falls back to a 90-day window with no events', () => {
    const now = Date.parse('2026-06-09T12:00:00Z');
    const range = timelineRange([], now);
    expect(range.end).toBe(now);
    expect(range.end - range.start).toBe(90 * 24 * 60 * 60 * 1000);
  });
});

describe('monthMarks', () => {
  it('returns percent-positioned month boundaries inside the range', () => {
    const start = Date.parse('2026-03-15T00:00:00Z');
    const end = Date.parse('2026-06-09T00:00:00Z');
    const marks = monthMarks(start, end);
    expect(marks.map((m) => m.label)).toEqual(['Apr', 'May', 'Jun']);
    for (const m of marks) {
      expect(m.pct).toBeGreaterThan(0);
      expect(m.pct).toBeLessThan(100);
    }
    // Ascending positions
    expect([...marks].sort((a, b) => a.pct - b.pct)).toEqual(marks);
  });
});

describe('densityBuckets', () => {
  it('counts events per bucket and clamps edges', () => {
    const start = 0;
    const end = 100_000;
    const events = [
      event({ kind: 'comment_added', createdAt: new Date(0).toISOString() }),
      event({ kind: 'comment_added', createdAt: new Date(50_000).toISOString() }),
      event({ kind: 'comment_added', createdAt: new Date(50_001).toISOString() }),
      event({ kind: 'comment_added', createdAt: new Date(100_000).toISOString() }),
    ];
    const buckets = densityBuckets(events, start, end, 10);
    expect(buckets).toHaveLength(10);
    expect(buckets[0]).toBe(1);
    expect(buckets[5]).toBe(2);
    expect(buckets[9]).toBe(1);
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(4);
  });
});

// ---- component-level: scrubbed snapshots render historical bar geometry ----

function asFeature(s: (typeof baseNow)[number]): Feature {
  return {
    projectId: 'p1',
    sortOrder: 0,
    descriptionMd: '',
    size: null,
    riskMd: '',
    objectiveId: null,
    releaseId: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    score: 0,
    boosts: 0,
    cools: 0,
    myVote: 0,
    ...s,
  };
}

afterEach(cleanup);

describe('Time Machine scrubbing (Gantt integration)', () => {
  it('renders bars at historical positions for a scrubbed snapshot', () => {
    const events = [
      event({ kind: 'dates_changed', createdAt: '2026-06-05T10:00:00Z', payload: {
        from: { startDate: '2026-05-20', endDate: '2026-06-03' },
        to: { startDate: '2026-06-01', endDate: '2026-06-15' },
      } }),
      event({ kind: 'feature_created', featureId: 'f2', createdAt: '2026-06-06T10:00:00Z', payload: {
        to: 'Gantt roadmap',
        snapshot: { title: 'Gantt roadmap', horizon: 'next', status: 'planned', startDate: null, endDate: null },
      } }),
    ];
    const historical = reconstructState(baseNow, events, '2026-06-01T00:00:00Z');
    const features = historical.map((s) => asFeature(s as (typeof baseNow)[number]));

    const { container } = render(
      createElement(GanttChart, { features, onCommitDates: () => {}, onBarClick: () => {} }),
    );

    // f2 hadn't been created yet at the scrub time.
    expect(container.querySelector('[data-gantt-bar-id="f2"]')).toBeNull();

    // f1 sits at its pre-change span.
    const bar = container.querySelector('[data-gantt-bar-id="f1"]')!;
    expect(bar).not.toBeNull();
    const viewStart = container.querySelector('[data-gantt-plot]')!.getAttribute('data-view-start')!;
    expect(Number(bar.getAttribute('x'))).toBe(dateToX('2026-05-20', viewStart, PX_PER_DAY));
    // 15 inclusive days wide (May 20 → Jun 3)
    expect(Number(bar.getAttribute('width'))).toBe(15 * PX_PER_DAY);
  });
});
