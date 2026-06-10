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
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    </div>
  );
}

export function Landing() {
  const { data, isPending, isError, refetch } = useOverview();

  if (isPending) return <LandingSkeleton />;

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
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
      <VisionHeader product={data.product} />
      <GanttHero features={data.features} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {HORIZONS.map((h) => (
          <HorizonPanel
            key={h}
            horizon={h}
            features={data.features.filter((f) => f.horizon === h)}
          />
        ))}
        <AttentionPanel items={data.attention} />
      </div>
    </div>
  );
}

export default Landing;
