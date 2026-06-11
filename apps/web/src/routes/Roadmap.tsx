import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { History } from 'lucide-react';
import { toast } from 'sonner';
import type { Feature } from '@productmap/shared';
import { useFeatures, useUpdateFeature, useWorkspaceActivity } from '@/lib/api';
import { FeatureDetailPanel } from '@/components/board/FeatureDetailPanel';
import { GanttChart } from '@/components/gantt/GanttChart';
import { TimeMachine } from '@/components/gantt/TimeMachine';
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

  // Time Machine (Spec 2.1): scrub history client-side from the activity feed.
  const [historyMode, setHistoryMode] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null); // null = now
  const activityQuery = useWorkspaceActivity(historyMode);
  const activityEvents = useMemo(() => activityQuery.data ?? [], [activityQuery.data]);
  const historyRange = useMemo(() => timelineRange(activityEvents), [activityEvents]);
  const scrubValue = scrubTime ?? historyRange.end;

  /** Features as of the scrub time — replayed backward from now, no writes. */
  const displayFeatures = useMemo(() => {
    if (!historyMode || !features || scrubTime === null) return features;
    const snapshots = new Map(
      reconstructState(features, activityEvents, scrubTime).map((s) => [s.id, s]),
    );
    return features.filter((f) => snapshots.has(f.id)).map((f) => ({ ...f, ...snapshots.get(f.id)! }));
  }, [historyMode, features, activityEvents, scrubTime]);

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

  const unscheduled = useMemo(
    () => (features ?? []).filter((f) => !f.startDate || !f.endDate),
    [features],
  );

  function commitDates(feature: Feature, patch: { startDate?: string; endDate?: string }) {
    const startDate = patch.startDate ?? feature.startDate;
    const endDate = patch.endDate ?? feature.endDate;
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
    updateFeature.mutate(
      { id: feature.id, startDate, endDate },
      {
        onSuccess: () =>
          toast.success(`Scheduled '${feature.title}' for ${formatRange(startDate, endDate)}`),
        onError: () => toast.error(`Couldn't schedule '${feature.title}' — restored`),
      },
    );
  }

  return (
    // AppShell's <main> already provides the centered max-width container and page padding.
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Roadmap</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {historyMode
              ? 'Time travel — scrub to replay how the roadmap evolved. Read-only until you come back to now.'
              : 'Drag a bar to move its dates, drag its right edge to resize, or click it for details.'}
          </p>
        </div>
        <button
          type="button"
          data-testid="history-toggle"
          aria-pressed={historyMode}
          onClick={() => (historyMode ? exitHistory() : setHistoryMode(true))}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring ${
            historyMode
              ? 'border-transparent bg-action-soft text-action'
              : 'border-line text-body-ink hover:bg-surface/60 hover:text-ink'
          }`}
        >
          <History className="h-3.5 w-3.5" aria-hidden />
          History
        </button>
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
              onBarClick={historyMode ? () => {} : (f) => setSelectedId(f.id)}
              highlightId={highlightId}
              trayDropActive={trayDragging}
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
