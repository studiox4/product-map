import { describe, expect, it } from 'vitest';
import type { Feature, PlanEntry } from '@productmap/shared';
import { computePlanDiff } from './plan-diff';

function feature(overrides: Partial<Feature>): Feature {
  return {
    id: 'f-' + Math.random().toString(36).slice(2),
    projectId: 'p1',
    score: 0,
    boosts: 0,
    cools: 0,
    myVote: 0 as const,
    title: 'Feature',
    horizon: 'now',
    status: 'planned',
    startDate: null,
    endDate: null,
    sortOrder: 0,
    descriptionMd: '',
    size: null,
    riskMd: '',
    objectiveId: null,
    releaseId: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function entry(overrides: Partial<PlanEntry> & { featureId: string }): PlanEntry {
  return { planId: 'plan-1', startDate: null, endDate: null, horizon: 'now', ...overrides };
}

describe('computePlanDiff', () => {
  it('reports date changes with from/to', () => {
    const f = feature({ id: 'f1', title: 'A', startDate: '2026-06-01', endDate: '2026-06-15' });
    const diff = computePlanDiff(
      [f],
      [entry({ featureId: 'f1', startDate: '2026-07-01', endDate: '2026-07-15', horizon: 'now' })],
    );
    expect(diff).toEqual([
      {
        featureId: 'f1',
        title: 'A',
        fields: {
          startDate: { from: '2026-06-01', to: '2026-07-01' },
          endDate: { from: '2026-06-15', to: '2026-07-15' },
        },
      },
    ]);
  });

  it('reports horizon changes', () => {
    const f = feature({ id: 'f1', title: 'A', horizon: 'later' });
    const diff = computePlanDiff([f], [entry({ featureId: 'f1', horizon: 'now' })]);
    expect(diff[0].fields).toEqual({ horizon: { from: 'later', to: 'now' } });
  });

  it('omits unchanged features entirely', () => {
    const f = feature({ id: 'f1', startDate: '2026-06-01', endDate: '2026-06-15' });
    const diff = computePlanDiff(
      [f],
      [entry({ featureId: 'f1', startDate: '2026-06-01', endDate: '2026-06-15', horizon: 'now' })],
    );
    expect(diff).toEqual([]);
  });

  it('skips entries whose feature was deleted since the snapshot', () => {
    const diff = computePlanDiff([], [entry({ featureId: 'gone', startDate: '2026-06-01' })]);
    expect(diff).toEqual([]);
  });

  it('sorts results by feature title', () => {
    const fs = [
      feature({ id: 'f1', title: 'Zebra', horizon: 'now' }),
      feature({ id: 'f2', title: 'Apple', horizon: 'now' }),
    ];
    const diff = computePlanDiff(fs, [
      entry({ featureId: 'f1', horizon: 'later' }),
      entry({ featureId: 'f2', horizon: 'later' }),
    ]);
    expect(diff.map((d) => d.title)).toEqual(['Apple', 'Zebra']);
  });
});
