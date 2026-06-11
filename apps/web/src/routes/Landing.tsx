import { HORIZONS } from '@productmap/shared';
import { useOverview } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import VisionHeader from '@/components/landing/VisionHeader';
import GanttHero from '@/components/landing/GanttHero';
import HorizonPanel from '@/components/landing/HorizonPanel';
import AttentionPanel from '@/components/landing/AttentionPanel';

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
      <div className="fade-up">
        <VisionHeader product={data.product} />
      </div>
      <div className="fade-up" style={{ animationDelay: '60ms' }}>
        <GanttHero features={data.features} />
      </div>
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 lg:grid-cols-4">
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
      </div>
    </div>
  );
}

export default Landing;
