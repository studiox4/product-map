// @vitest-environment jsdom
// Roadmap scenario plans (dream tier 2 §6): plan switcher, scenario isolation
// (plan-entry writes, never feature writes), ghost compare, apply diff dialog.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Feature, Plan, PlanWithEntries } from '@productmap/shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GanttChart } from './GanttChart';
import { PlanSwitcher } from './PlanSwitcher';

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

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  if (!('ResizeObserver' in window)) {
    // @ts-expect-error test polyfill
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function feature(overrides: Partial<Feature> & { id: string; title: string }): Feature {
  return {
    productId: 'p1',
    score: 0,
    boosts: 0,
    cools: 0,
    myVote: 0 as const,
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

const features: Feature[] = [
  feature({ id: 'f1', title: 'Editor', startDate: '2026-06-01', endDate: '2026-06-15' }),
  feature({ id: 'f2', title: 'Gantt', startDate: '2026-07-01', endDate: '2026-07-20' }),
];

const plan: Plan = {
  id: 'plan-1',
  name: 'Q4 stretch',
  status: 'draft',
  createdBy: 'u1',
  appliedAt: null,
  createdAt: '2026-06-09T00:00:00Z',
  updatedAt: '2026-06-09T00:00:00Z',
};

// f1: shifted a month. f2: same dates, recolored Now → Later.
const planWithEntries: PlanWithEntries = {
  ...plan,
  entries: [
    { planId: 'plan-1', featureId: 'f1', startDate: '2026-07-01', endDate: '2026-07-15', horizon: 'now' },
    { planId: 'plan-1', featureId: 'f2', startDate: '2026-07-01', endDate: '2026-07-20', horizon: 'later' },
  ],
};

const mocks = vi.hoisted(() => ({
  updateFeatureMutate: vi.fn(),
  updateEntryMutate: vi.fn(),
  applyMutate: vi.fn(),
  createMutate: vi.fn(),
  renameMutate: vi.fn(),
  deleteMutate: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  useFeatures: () => ({ data: features, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateFeature: () => ({ mutate: mocks.updateFeatureMutate, isPending: false }),
  useReleases: () => ({ data: [] }),
  useAllDependencies: () => ({ data: [] }),
  useWorkspaceActivity: () => ({ data: [], isLoading: false }),
  usePlans: () => ({ data: [plan], isLoading: false }),
  usePlan: (id: string | null) => ({
    data: id === 'plan-1' ? planWithEntries : undefined,
    isLoading: false,
  }),
  useCreatePlan: () => ({ mutate: mocks.createMutate, isPending: false }),
  useRenamePlan: () => ({ mutate: mocks.renameMutate, isPending: false }),
  useDeletePlan: () => ({ mutate: mocks.deleteMutate, isPending: false }),
  useUpdatePlanEntry: () => ({ mutate: mocks.updateEntryMutate, isPending: false }),
  useApplyPlan: () => ({ mutate: mocks.applyMutate, isPending: false }),
}));

// Detail panel pulls many more api hooks — out of scope here.
vi.mock('@/components/board/FeatureDetailPanel', () => ({
  FeatureDetailPanel: () => null,
}));

import RoadmapPage from '@/routes/Roadmap';

function renderRoadmap() {
  return render(
    <MemoryRouter>
      <RoadmapPage />
    </MemoryRouter>,
  );
}

function enterScenario() {
  fireEvent.click(screen.getByTestId('plan-pill-plan-1'));
}

beforeEach(() => {
  Object.values(mocks).forEach((fn) => fn.mockReset());
});
afterEach(cleanup);

describe('GanttChart ghost layer', () => {
  it('renders current-schedule ghosts at 30% opacity, non-interactive', () => {
    const scenario = features.map((f) =>
      f.id === 'f1' ? { ...f, startDate: '2026-07-01', endDate: '2026-07-15' } : f,
    );
    render(
      <GanttChart
        features={scenario}
        ghostFeatures={features}
        onCommitDates={() => {}}
        onBarClick={() => {}}
      />,
    );
    const ghost = screen.getByTestId('gantt-ghost-f1');
    expect(ghost.getAttribute('fill-opacity')).toBe('0.3');
    expect(ghost.getAttribute('pointer-events')).toBe('none');
    // The scenario bar still renders on top at the shifted position.
    expect(screen.getByTestId('gantt-bar-f1')).toBeTruthy();
  });

  it('renders no ghosts without the prop', () => {
    render(<GanttChart features={features} onCommitDates={() => {}} onBarClick={() => {}} />);
    expect(screen.queryByTestId(/^gantt-ghost-/)).toBeNull();
  });

  it('shows the horizon select only when onHorizonChange is provided', () => {
    const onHorizonChange = vi.fn();
    const { rerender } = render(
      <GanttChart features={features} onCommitDates={() => {}} onBarClick={() => {}} />,
    );
    expect(screen.queryByTestId('gantt-horizon-select-f1')).toBeNull();

    rerender(
      <GanttChart
        features={features}
        onCommitDates={() => {}}
        onBarClick={() => {}}
        onHorizonChange={onHorizonChange}
      />,
    );
    fireEvent.change(screen.getByTestId('gantt-horizon-select-f1'), {
      target: { value: 'later' },
    });
    expect(onHorizonChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f1' }),
      'later',
    );
  });
});

describe('PlanSwitcher', () => {
  const noop = () => {};

  it('renders Current + plan pills and selects on click', () => {
    const onSelect = vi.fn();
    render(
      <PlanSwitcher
        plans={[plan]}
        activePlanId={null}
        onSelect={onSelect}
        onCreate={noop}
        onRename={noop}
        onDelete={noop}
      />,
    );
    expect(screen.getByTestId('plan-pill-current').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('plan-pill-plan-1'));
    expect(onSelect).toHaveBeenCalledWith('plan-1');
  });

  it('creates a plan via the New plan dialog', async () => {
    const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
    const onCreate = vi.fn();
    render(
      <PlanSwitcher
        plans={[]}
        activePlanId={null}
        onSelect={noop}
        onCreate={onCreate}
        onRename={noop}
        onDelete={noop}
      />,
    );
    await user.click(screen.getByTestId('plan-new'));
    await user.type(screen.getByLabelText('Name'), 'Q4 stretch');
    await user.click(screen.getByRole('button', { name: 'Create plan' }));
    expect(onCreate).toHaveBeenCalledWith('Q4 stretch');
  });

  it('renames and deletes via the ⋯ menu', async () => {
    const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <PlanSwitcher
        plans={[plan]}
        activePlanId={null}
        onSelect={noop}
        onCreate={noop}
        onRename={onRename}
        onDelete={onDelete}
      />,
    );
    await user.click(screen.getByTestId('plan-menu-plan-1'));
    await user.click(await screen.findByTestId('plan-rename-plan-1'));
    const input = screen.getByLabelText('Name');
    await user.clear(input);
    await user.type(input, 'Q4 realistic');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(onRename).toHaveBeenCalledWith('plan-1', 'Q4 realistic');

    await user.click(screen.getByTestId('plan-menu-plan-1'));
    await user.click(await screen.findByTestId('plan-delete-plan-1'));
    expect(onDelete).toHaveBeenCalledWith('plan-1');
  });
});

describe('Roadmap scenario mode', () => {
  it('shows the banner and renders bars from plan entries', () => {
    renderRoadmap();
    enterScenario();
    expect(screen.getByTestId('scenario-banner').textContent).toContain(
      "Editing scenario 'Q4 stretch'",
    );
    // f1's bar reflects the entry's shifted dates, not the live schedule.
    expect(screen.getByTestId('gantt-bar-f1').getAttribute('aria-label')).toBe(
      'Editor, 2026-07-01 to 2026-07-15',
    );
  });

  it('drag in scenario mode writes the plan entry, never the feature', () => {
    renderRoadmap();
    enterScenario();
    const bar = screen.getByTestId('gantt-bar-f1');
    fireEvent.pointerDown(bar, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 220, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 220, clientY: 50, pointerId: 1 });
    expect(mocks.updateEntryMutate).toHaveBeenCalledTimes(1);
    expect(mocks.updateEntryMutate.mock.calls[0][0]).toEqual({
      planId: 'plan-1',
      featureId: 'f1',
      startDate: '2026-07-31',
      endDate: '2026-08-14',
    });
    expect(mocks.updateFeatureMutate).not.toHaveBeenCalled();
  });

  it('horizon select in scenario mode writes the plan entry, never the feature', () => {
    renderRoadmap();
    enterScenario();
    fireEvent.change(screen.getByTestId('gantt-horizon-select-f1'), {
      target: { value: 'next' },
    });
    expect(mocks.updateEntryMutate).toHaveBeenCalledTimes(1);
    expect(mocks.updateEntryMutate.mock.calls[0][0]).toEqual({
      planId: 'plan-1',
      featureId: 'f1',
      horizon: 'next',
    });
    expect(mocks.updateFeatureMutate).not.toHaveBeenCalled();
  });

  it('drag on the Current roadmap still writes the feature', () => {
    renderRoadmap();
    const bar = screen.getByTestId('gantt-bar-f1');
    fireEvent.pointerDown(bar, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 220, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 220, clientY: 50, pointerId: 1 });
    expect(mocks.updateFeatureMutate).toHaveBeenCalledTimes(1);
    expect(mocks.updateEntryMutate).not.toHaveBeenCalled();
  });

  it('Compare toggles ghost bars of the current schedule', () => {
    renderRoadmap();
    enterScenario();
    expect(screen.queryByTestId('gantt-ghost-f1')).toBeNull();
    fireEvent.click(screen.getByTestId('compare-toggle'));
    const ghost = screen.getByTestId('gantt-ghost-f1');
    expect(ghost.getAttribute('fill-opacity')).toBe('0.3');
    fireEvent.click(screen.getByTestId('compare-toggle'));
    expect(screen.queryByTestId('gantt-ghost-f1')).toBeNull();
  });

  it('Apply opens a confirm dialog listing the client-computed diff, then applies', async () => {
    const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
    renderRoadmap();
    enterScenario();
    await user.click(screen.getByTestId('apply-plan'));
    const list = await screen.findByTestId('apply-diff-list');
    const f1Item = within(list).getByTestId('apply-diff-f1');
    expect(f1Item.textContent).toContain('Editor');
    expect(f1Item.textContent).toContain('Dates:');
    const f2Item = within(list).getByTestId('apply-diff-f2');
    expect(f2Item.textContent).toContain('Gantt');
    expect(f2Item.textContent).toContain('Horizon: Now → Later');

    await user.click(screen.getByTestId('apply-plan-confirm'));
    expect(mocks.applyMutate).toHaveBeenCalledTimes(1);
    expect(mocks.applyMutate.mock.calls[0][0]).toBe('plan-1');
  });

  it('disables the History pill with a tooltip inside scenario mode', () => {
    renderRoadmap();
    enterScenario();
    const history = screen.getByTestId('history-toggle');
    expect(history.hasAttribute('disabled')).toBe(true);
    expect(history.getAttribute('title')).toBe(
      'History is unavailable while editing a scenario',
    );
  });
});
