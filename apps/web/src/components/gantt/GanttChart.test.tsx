// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HORIZON_COLORS, type Feature } from '@productmap/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GanttChart } from './GanttChart';
import { UnscheduledTray } from './UnscheduledTray';

// jsdom has no PointerEvent; polyfill on MouseEvent so clientX/clientY survive fireEvent.
if (typeof window !== 'undefined' && !window.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  // @ts-expect-error assigning polyfill
  window.PointerEvent = PointerEventPolyfill;
}

function feature(overrides: Partial<Feature>): Feature {
  return {
    id: 'f-' + Math.random().toString(36).slice(2),
    productId: 'p1',
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

const dated: Feature[] = [
  feature({ id: 'f1', title: 'Rich markdown editor', horizon: 'now', startDate: '2026-06-01', endDate: '2026-06-15' }),
  feature({ id: 'f2', title: 'Gantt roadmap', horizon: 'next', startDate: '2026-07-01', endDate: '2026-07-20' }),
  feature({ id: 'f3', title: 'Comments & review', horizon: 'later', startDate: '2026-08-01', endDate: '2026-08-10' }),
];
const dateless = feature({ id: 'f4', title: 'ECS deployment', horizon: 'later' });

afterEach(cleanup);

describe('GanttChart', () => {
  it('renders one bar per dated feature, skipping dateless ones', () => {
    render(
      <GanttChart
        features={[...dated, dateless]}
        onCommitDates={() => {}}
        onBarClick={() => {}}
      />,
    );
    const bars = screen.getAllByTestId(/^gantt-bar-/);
    expect(bars.length).toBe(3);
    expect(screen.queryByTestId('gantt-bar-f4')).toBeNull();
  });

  it('fills bars with HORIZON_COLORS', () => {
    render(<GanttChart features={dated} onCommitDates={() => {}} onBarClick={() => {}} />);
    expect(screen.getByTestId('gantt-bar-f1').getAttribute('fill')).toBe(HORIZON_COLORS.now.bar);
    expect(screen.getByTestId('gantt-bar-f2').getAttribute('fill')).toBe(HORIZON_COLORS.next.bar);
    expect(screen.getByTestId('gantt-bar-f3').getAttribute('fill')).toBe(HORIZON_COLORS.later.bar);
  });

  it('renders a today line and row labels', () => {
    render(<GanttChart features={dated} onCommitDates={() => {}} onBarClick={() => {}} />);
    expect(screen.getByTestId('gantt-today-line')).toBeTruthy();
    expect(screen.getAllByText('Rich markdown editor').length).toBeGreaterThan(0);
  });

  it('drag right by 120px commits both dates shifted +30 days', () => {
    const onCommit = vi.fn();
    render(<GanttChart features={dated} onCommitDates={onCommit} onBarClick={() => {}} />);
    const bar = screen.getByTestId('gantt-bar-f1');
    fireEvent.pointerDown(bar, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 220, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 220, clientY: 50, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    const [feat, patch] = onCommit.mock.calls[0];
    expect(feat.id).toBe('f1');
    expect(patch).toEqual({ startDate: '2026-07-01', endDate: '2026-07-15' });
  });

  it('resize via right edge by +40px commits endDate +10 days only', () => {
    const onCommit = vi.fn();
    render(<GanttChart features={dated} onCommitDates={onCommit} onBarClick={() => {}} />);
    const handle = screen.getByTestId('gantt-resize-f1');
    fireEvent.pointerDown(handle, { clientX: 300, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 340, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 340, clientY: 50, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    const [feat, patch] = onCommit.mock.calls[0];
    expect(feat.id).toBe('f1');
    expect(patch).toEqual({ endDate: '2026-06-25' });
  });

  it('resize cannot shrink below 1 day', () => {
    const onCommit = vi.fn();
    render(<GanttChart features={dated} onCommitDates={onCommit} onBarClick={() => {}} />);
    const handle = screen.getByTestId('gantt-resize-f3'); // 10-day bar
    fireEvent.pointerDown(handle, { clientX: 300, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 100, clientY: 50, pointerId: 1 }); // -200px = -50d
    fireEvent.pointerUp(handle, { clientX: 100, clientY: 50, pointerId: 1 });
    const [, patch] = onCommit.mock.calls[0];
    expect(patch).toEqual({ endDate: '2026-08-01' }); // clamped to startDate (1-day bar)
  });

  it('pointer movement under 5px is a click, not a drag', () => {
    const onCommit = vi.fn();
    const onClick = vi.fn();
    render(<GanttChart features={dated} onCommitDates={onCommit} onBarClick={onClick} />);
    const bar = screen.getByTestId('gantt-bar-f2');
    fireEvent.pointerDown(bar, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 103, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 103, clientY: 50, pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0].id).toBe('f2');
  });

  it('zero-day drag commits nothing', () => {
    const onCommit = vi.fn();
    const onClick = vi.fn();
    render(<GanttChart features={dated} onCommitDates={onCommit} onBarClick={onClick} />);
    const bar = screen.getByTestId('gantt-bar-f1');
    fireEvent.pointerDown(bar, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 107, clientY: 50, pointerId: 1 }); // 7px > click tolerance, <0.5 day... 7/4=1.75 -> 2d
    fireEvent.pointerMove(bar, { clientX: 101, clientY: 50, pointerId: 1 }); // back to ~0
    fireEvent.pointerUp(bar, { clientX: 101, clientY: 50, pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows an empty state when no features are dated', () => {
    render(<GanttChart features={[dateless]} onCommitDates={() => {}} onBarClick={() => {}} />);
    expect(screen.getByText(/no scheduled features/i)).toBeTruthy();
  });

  it('draws a dependency arrow per edge whose endpoints both have bars', () => {
    render(
      <GanttChart
        features={[...dated, dateless]}
        onCommitDates={() => {}}
        onBarClick={() => {}}
        dependencyEdges={[
          { blockerId: 'f1', blockedId: 'f2' },
          { blockerId: 'f4', blockedId: 'f2' }, // f4 is dateless → skipped
        ]}
      />,
    );
    expect(screen.getByTestId('gantt-dep-f1-f2')).toBeTruthy();
    expect(screen.queryByTestId('gantt-dep-f4-f2')).toBeNull();
    expect(screen.getByTestId('gantt-dep-f1-f2').getAttribute('marker-end')).toBe(
      'url(#pm-dep-arrowhead)',
    );
  });

  it('renders release milestones with sage-when-shipped state', () => {
    render(
      <GanttChart
        features={dated}
        onCommitDates={() => {}}
        onBarClick={() => {}}
        releases={[
          {
            id: 'r1', name: 'v0.2 — Team ready', targetDate: '2026-07-15',
            status: 'planned', notesDocId: null, shippedAt: null, createdAt: '2026-06-01T00:00:00Z',
          },
          {
            id: 'r2', name: 'v0.1', targetDate: '2026-06-20',
            status: 'shipped', notesDocId: null, shippedAt: '2026-06-20T00:00:00Z',
            createdAt: '2026-05-01T00:00:00Z',
          },
          {
            id: 'r3', name: 'Dateless', targetDate: null,
            status: 'planned', notesDocId: null, shippedAt: null, createdAt: '2026-05-01T00:00:00Z',
          },
        ]}
      />,
    );
    expect(screen.getByTestId('gantt-milestone-r1').getAttribute('data-release-status')).toBe(
      'planned',
    );
    expect(screen.getByTestId('gantt-milestone-r2').getAttribute('data-release-status')).toBe(
      'shipped',
    );
    expect(screen.queryByTestId('gantt-milestone-r3')).toBeNull();
    expect(screen.getByText('v0.2 — Team ready')).toBeTruthy();
  });

  it('shows the capacity strip only when toggled, flagging overcommitted months', () => {
    const heavy = [
      feature({ id: 'h1', title: 'A', startDate: '2026-06-01', endDate: '2026-06-30', size: 'l' }),
      feature({ id: 'h2', title: 'B', startDate: '2026-06-01', endDate: '2026-06-30', size: 'l' }),
      feature({ id: 'h3', title: 'C', startDate: '2026-06-01', endDate: '2026-06-30', size: 'l' }),
    ];
    const { rerender } = render(
      <GanttChart features={heavy} onCommitDates={() => {}} onBarClick={() => {}} />,
    );
    expect(screen.queryByTestId('gantt-capacity-strip')).toBeNull();

    rerender(
      <GanttChart features={heavy} onCommitDates={() => {}} onBarClick={() => {}} showCapacity />,
    );
    expect(screen.getByTestId('gantt-capacity-strip')).toBeTruthy();
    // 18w of load vs ~17.1w June capacity → overcommitted warm wash.
    expect(
      screen.getByTestId('capacity-month-2026-06').getAttribute('data-overcommitted'),
    ).toBe('true');
  });
});

describe('UnscheduledTray', () => {
  it('renders a chip per dateless feature', () => {
    render(
      <UnscheduledTray
        features={[dateless, feature({ id: 'f5', title: 'Up/down voting' })]}
        onSchedule={() => {}}
      />,
    );
    expect(screen.getByText('ECS deployment')).toBeTruthy();
    expect(screen.getByText('Up/down voting')).toBeTruthy();
    expect(screen.getAllByTestId(/^gantt-tray-chip-/).length).toBe(2);
  });

  it('renders an empty hint when everything is scheduled', () => {
    render(<UnscheduledTray features={[]} onSchedule={() => {}} />);
    expect(screen.getByText(/everything is scheduled/i)).toBeTruthy();
  });
});
