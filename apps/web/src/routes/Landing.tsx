import { useQuery } from '@tanstack/react-query';
import { HORIZONS, type WorkspaceActivityItem } from '@productmap/shared';
import { fetchJson, useOverview } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import VisionHeader from '@/components/landing/VisionHeader';
import GanttHero from '@/components/landing/GanttHero';
import HorizonPanel from '@/components/landing/HorizonPanel';
import AttentionPanel from '@/components/landing/AttentionPanel';
import VelocitySparkline from '@/components/landing/VelocitySparkline';
import HorizonArc from '@/components/landing/HorizonArc';
import PulseHeatmap from '@/components/landing/PulseHeatmap';
import AiDigestCard from '@/components/landing/AiDigestCard';

const ACTIVITY_WINDOW_DAYS = 12 * 7; // covers the heatmap (12 weeks) and sparkline (8 weeks)

/** Workspace-wide activity for the landing viz layer (sparkline + pulse heatmap). */
function useWorkspaceActivity() {
  return useQuery({
    queryKey: ['activity', 'workspace'] as const,
    queryFn: () => {
      const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      return fetchJson<WorkspaceActivityItem[]>(
        `/api/activity?since=${encodeURIComponent(since.toISOString())}`,
      );
    },
  });
}

function LandingSkeleton() {
  return (
    <div className="space-y-8" data-testid="landing-skeleton">
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="shimmer rounded-2xl bg-surface p-4 shadow-card">
        <Skeleton className="h-44 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="shimmer space-y-3 rounded-2xl bg-surface p-4 shadow-card">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Landing() {
  const { data, isPending, isError, refetch } = useOverview();
  const activity = useWorkspaceActivity();
  const events = activity.data ?? [];

  if (isPending) return <LandingSkeleton />;

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-transparent bg-surface p-8 text-center shadow-card">
        <p className="text-sm text-muted-foreground">
          Couldn't load the overview. Check that the API is running.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="fade-up flex flex-wrap items-start justify-between gap-4">
        <VisionHeader product={data.product} />
        {activity.data ? <VelocitySparkline events={events} /> : null}
      </div>
      <div className="fade-up" style={{ animationDelay: '60ms' }}>
        <GanttHero features={data.features} />
      </div>
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {HORIZONS.map((h, i) => (
          <div key={h} className="fade-up" style={{ animationDelay: `${120 + i * 60}ms` }}>
            <HorizonPanel
              horizon={h}
              features={data.features.filter((f) => f.horizon === h)}
            />
          </div>
        ))}
        <div className="fade-up" style={{ animationDelay: '300ms' }}>
          <AttentionPanel items={data.attention} />
        </div>
        <div className="fade-up" style={{ animationDelay: '360ms' }}>
          <PulseHeatmap
            events={events}
            headerAccessory={<HorizonArc features={data.features} />}
          />
        </div>
      </div>
      <div className="fade-up" style={{ animationDelay: '420ms' }}>
        <AiDigestCard />
      </div>
    </div>
  );
}

export default Landing;
