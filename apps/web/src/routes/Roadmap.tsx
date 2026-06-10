import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import type { Feature } from '@productmap/shared';
import { useFeatures, useUpdateFeature } from '@/lib/api';
import { FeatureDetailPanel } from '@/components/board/FeatureDetailPanel';
import { GanttChart } from '@/components/gantt/GanttChart';
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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Roadmap</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drag a bar to move its dates, drag its right edge to resize, or click it for details.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-6" data-testid="roadmap-skeleton">
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <Skeleton className="mb-6 h-4 w-1/3" />
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <Skeleton className="mb-3 h-4 w-1/4" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-32 rounded-full" />
              <Skeleton className="h-8 w-32 rounded-full" />
            </div>
          </div>
        </div>
      )}

      {isError && (
        <div className="rounded-lg border bg-card p-12 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">Couldn't load the roadmap.</p>
          <Button className="mt-4" variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}

      {features && (
        <div className="space-y-6">
          <GanttChart
            features={features}
            onCommitDates={commitDates}
            onBarClick={(f) => setSelectedId(f.id)}
            highlightId={highlightId}
            trayDropActive={trayDragging}
          />
          <UnscheduledTray
            features={unscheduled}
            onSchedule={scheduleFeature}
            onDragChange={setTrayDragging}
          />
        </div>
      )}

      <FeatureDetailPanel featureId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
