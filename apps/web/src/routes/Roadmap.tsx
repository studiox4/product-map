import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Gauge, History } from 'lucide-react';
import { toast } from 'sonner';
import type { Feature, Horizon } from '@productmap/shared';
import {
  useAllDependencies,
  useApplyPlan,
  useCreatePlan,
  useDeletePlan,
  useFeatures,
  usePlan,
  usePlans,
  useReleases,
  useRenamePlan,
  useUpdateFeature,
  useUpdatePlanEntry,
  useWorkspaceActivity,
} from '@/lib/api';
import { FeatureDetailPanel } from '@/components/board/FeatureDetailPanel';
import { GanttChart } from '@/components/gantt/GanttChart';
import { PlanSwitcher } from '@/components/gantt/PlanSwitcher';
import { ScenarioBanner } from '@/components/gantt/ScenarioBanner';
import { TimeMachine } from '@/components/gantt/TimeMachine';
import { computePlanDiff } from '@/components/gantt/plan-diff';
import { reconstructState, timelineRange } from '@/components/gantt/history-replay';
import { UnscheduledTray } from '@/components/gantt/UnscheduledTray';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function formatRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return '';
  return `${format(parseISO(start), 'MMM d')} – ${format(parseISO(end), 'MMM d')}`;
}

export default function RoadmapPage() {
  const { data: features, isLoading, isError, refetch } = useFeatures();
  const updateFeature = useUpdateFeature();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [trayDragging, setTrayDragging] = useState(false);

  // Gantt upgrades (Dream Tier): arrows + milestones always on; capacity toggled.
  const [showCapacity, setShowCapacity] = useState(false);
  const releasesQuery = useReleases();
  const featureIds = useMemo(() => (features ?? []).map((f) => f.id), [features]);
  const dependenciesQuery = useAllDependencies(featureIds);

  // Scenario plans (Dream Tier 2 §6): drafts edited in isolation, then applied.
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const plansQuery = usePlans();
  const planQuery = usePlan(activePlanId);
  const createPlan = useCreatePlan();
  const renamePlan = useRenamePlan();
  const deletePlan = useDeletePlan();
  const updatePlanEntry = useUpdatePlanEntry();
  const applyPlan = useApplyPlan();
  const scenarioMode = activePlanId !== null;
  const planEntries = useMemo(() => planQuery.data?.entries ?? [], [planQuery.data]);

  /** Plan entries override dates+horizon; features missing from the snapshot keep their live values (the entry upsert seeds the same way server-side). */
  const scenarioFeatures = useMemo(() => {
    if (!scenarioMode || !features) return null;
    const byFeature = new Map(planEntries.map((e) => [e.featureId, e]));
    return features.map((f) => {
      const entry = byFeature.get(f.id);
      return entry
        ? { ...f, startDate: entry.startDate, endDate: entry.endDate, horizon: entry.horizon }
        : f;
    });
  }, [scenarioMode, features, planEntries]);

  const planDiff = useMemo(
    () => (scenarioMode && features ? computePlanDiff(features, planEntries) : []),
    [scenarioMode, features, planEntries],
  );

  function selectPlan(planId: string | null) {
    setActivePlanId(planId);
    setCompare(false);
    exitHistory(); // scenario and time-travel are mutually exclusive
  }

  // Time Machine (Spec 2.1): scrub history client-side from the activity feed.
  const [historyMode, setHistoryMode] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null); // null = now
  const activityQuery = useWorkspaceActivity(historyMode);
  const activityEvents = useMemo(() => activityQuery.data ?? [], [activityQuery.data]);
  const historyRange = useMemo(() => timelineRange(activityEvents), [activityEvents]);
  const scrubValue = scrubTime ?? historyRange.end;

  /** Features as displayed: scenario overlay, or replayed history — no writes. */
  const displayFeatures = useMemo(() => {
    if (scenarioFeatures) return scenarioFeatures;
    if (!historyMode || !features || scrubTime === null) return features;
    const snapshots = new Map(
      reconstructState(features, activityEvents, scrubTime).map((s) => [s.id, s]),
    );
    return features.filter((f) => snapshots.has(f.id)).map((f) => ({ ...f, ...snapshots.get(f.id)! }));
  }, [scenarioFeatures, historyMode, features, activityEvents, scrubTime]);

  function exitHistory() {
    setHistoryMode(false);
    setScrubTime(null);
  }

  const featureParam = searchParams.get('feature');

  // Deep link from the landing hero: scroll into view + highlight pulse, then fade.
  useEffect(() => {
    if (!featureParam || !features) return;
    setHighlightId(featureParam);
    const timer = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(timer);
  }, [featureParam, features]);

  // Tray feeds off the displayed schedule so scenario drops/edits reflect too.
  const unscheduled = useMemo(
    () => (scenarioFeatures ?? features ?? []).filter((f) => !f.startDate || !f.endDate),
    [scenarioFeatures, features],
  );

  function commitDates(feature: Feature, patch: { startDate?: string; endDate?: string }) {
    const startDate = patch.startDate ?? feature.startDate;
    const endDate = patch.endDate ?? feature.endDate;
    if (activePlanId) {
      // Scenario mode: write the plan entry, never the feature.
      updatePlanEntry.mutate(
        { planId: activePlanId, featureId: feature.id, ...patch },
        { onError: () => toast.error(`Couldn't move '${feature.title}' — restored`) },
      );
      return;
    }
    updateFeature.mutate(
      { id: feature.id, ...patch },
      {
        onSuccess: () =>
          toast.success(`Moved '${feature.title}' to ${formatRange(startDate, endDate)}`),
        onError: () => toast.error(`Couldn't move '${feature.title}' — restored`),
      },
    );
  }

  function scheduleFeature(feature: Feature, startDate: string, endDate: string) {
    if (activePlanId) {
      // Pass horizon so a feature new to the snapshot seeds correctly.
      updatePlanEntry.mutate(
        { planId: activePlanId, featureId: feature.id, startDate, endDate, horizon: feature.horizon },
        { onError: () => toast.error(`Couldn't schedule '${feature.title}' — restored`) },
      );
      return;
    }
    updateFeature.mutate(
      { id: feature.id, startDate, endDate },
      {
        onSuccess: () =>
          toast.success(`Scheduled '${feature.title}' for ${formatRange(startDate, endDate)}`),
        onError: () => toast.error(`Couldn't schedule '${feature.title}' — restored`),
      },
    );
  }

  /** Scenario-only horizon recolor (row-hover select in the gutter). */
  function changeScenarioHorizon(feature: Feature, horizon: Horizon) {
    if (!activePlanId) return;
    updatePlanEntry.mutate(
      { planId: activePlanId, featureId: feature.id, horizon },
      { onError: () => toast.error(`Couldn't update '${feature.title}' — restored`) },
    );
  }

  function handleApply() {
    if (!activePlanId) return;
    const planName = planQuery.data?.name ?? 'plan';
    applyPlan.mutate(activePlanId, {
      onSuccess: (result) => {
        toast.success(
          `Applied '${result.plan.name}' — ${result.changed.length} feature${
            result.changed.length === 1 ? '' : 's'
          } updated`,
        );
        selectPlan(null);
      },
      onError: () => toast.error(`Couldn't apply '${planName}'`),
    });
  }

  return (
    // AppShell's <main> already provides the centered max-width container and page padding.
    <div>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Roadmap</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {historyMode
              ? 'Time travel — scrub to replay how the roadmap evolved. Read-only until you come back to now.'
              : scenarioMode
                ? 'Scenario draft — drag bars and recolor horizons freely; nothing is real until you apply.'
                : 'Drag a bar to move its dates, drag its right edge to resize, or click it for details.'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 md:justify-end">
        <PlanSwitcher
          plans={plansQuery.data ?? []}
          activePlanId={activePlanId}
          onSelect={selectPlan}
          creating={createPlan.isPending}
          onCreate={(name) =>
            createPlan.mutate(
              { name },
              {
                onSuccess: (plan) => {
                  toast.success(`Created plan '${plan.name}'`);
                  selectPlan(plan.id);
                },
                onError: () => toast.error(`Couldn't create '${name}'`),
              },
            )
          }
          onRename={(planId, name) =>
            renamePlan.mutate(
              { id: planId, name },
              { onError: () => toast.error("Couldn't rename plan") },
            )
          }
          onDelete={(planId) =>
            deletePlan.mutate(planId, {
              onSuccess: () => {
                if (planId === activePlanId) selectPlan(null);
                toast.success('Plan deleted');
              },
              onError: () => toast.error("Couldn't delete plan"),
            })
          }
        />
        <button
          type="button"
          data-testid="capacity-toggle"
          aria-pressed={showCapacity}
          onClick={() => setShowCapacity((v) => !v)}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring ${
            showCapacity
              ? 'border-transparent bg-action-soft text-action'
              : 'border-line text-body-ink hover:bg-surface/60 hover:text-ink'
          }`}
        >
          <Gauge className="h-3.5 w-3.5" aria-hidden />
          Capacity
        </button>
        <button
          type="button"
          data-testid="history-toggle"
          aria-pressed={historyMode}
          disabled={scenarioMode}
          title={scenarioMode ? 'History is unavailable while editing a scenario' : undefined}
          onClick={() => (historyMode ? exitHistory() : setHistoryMode(true))}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
            historyMode
              ? 'border-transparent bg-action-soft text-action'
              : 'border-line text-body-ink hover:bg-surface/60 hover:text-ink'
          }`}
        >
          <History className="h-3.5 w-3.5" aria-hidden />
          History
        </button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-6" data-testid="roadmap-skeleton">
          <div className="rounded-2xl border border-transparent bg-card p-6 shadow-card">
            <Skeleton className="mb-6 h-4 w-1/3" />
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full rounded-full" />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border-2 border-dashed border-line-dash bg-surface/55 p-5">
            <Skeleton className="mb-3 h-4 w-1/4" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-32 rounded-full" />
              <Skeleton className="h-8 w-32 rounded-full" />
            </div>
          </div>
        </div>
      )}

      {isError && (
        <div className="rounded-2xl border border-transparent bg-card p-12 text-center shadow-card">
          <p className="text-sm text-muted-foreground">Couldn't load the roadmap.</p>
          <Button className="mt-4" variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}

      {features && scenarioMode && planQuery.data && (
        <ScenarioBanner
          planName={planQuery.data.name}
          compare={compare}
          onCompareChange={setCompare}
          diff={planDiff}
          onApply={handleApply}
          applying={applyPlan.isPending}
        />
      )}

      {features && (
        <div className="space-y-6">
          {/* History mode: read-only (no pointer interaction) + 300ms ease-out bar
              transitions on x/width/fill so scrubbing animates instead of snapping.
              motion-safe keeps the reduced-motion snap behavior from index.css. */}
          <div
            aria-disabled={historyMode || undefined}
            className={
              historyMode
                ? 'pointer-events-none motion-safe:[&_.gantt-settle]:[transition:x_300ms_ease-out,width_300ms_ease-out,fill_300ms_ease-out]'
                : undefined
            }
          >
            <GanttChart
              features={displayFeatures ?? features}
              onCommitDates={historyMode ? () => {} : commitDates}
              // Scenario mode: detail panel edits REAL features, so bar click
              // is off — scenario edits stay scoped to dates + horizon.
              onBarClick={historyMode || scenarioMode ? () => {} : (f) => setSelectedId(f.id)}
              highlightId={highlightId}
              trayDropActive={trayDragging}
              releases={releasesQuery.data ?? []}
              dependencyEdges={dependenciesQuery.data ?? []}
              showCapacity={showCapacity}
              ghostFeatures={scenarioMode && compare ? features : undefined}
              onHorizonChange={scenarioMode ? changeScenarioHorizon : undefined}
            />
          </div>

          {historyMode ? (
            activityQuery.isLoading ? (
              <div className="rounded-2xl border border-transparent bg-card px-5 py-4 shadow-card">
                <Skeleton className="h-10 w-full rounded-full" />
              </div>
            ) : (
              <TimeMachine
                events={activityEvents}
                value={scrubValue}
                range={historyRange}
                onChange={setScrubTime}
                onBackToNow={exitHistory}
              />
            )
          ) : (
            <UnscheduledTray
              features={unscheduled}
              onSchedule={scheduleFeature}
              onDragChange={setTrayDragging}
            />
          )}
        </div>
      )}

      <FeatureDetailPanel featureId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
