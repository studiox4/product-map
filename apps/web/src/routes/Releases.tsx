import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useReleases } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ReleaseCard } from '@/components/releases/ReleaseCard';
import { NewReleaseDialog } from '@/components/releases/NewReleaseDialog';
import { useCanEdit } from '@/lib/project';

/** /releases — planned & shipped bundles (Dream tier D7). */
export default function Releases() {
  const releasesQuery = useReleases();
  const [creating, setCreating] = useState(false);
  const canEdit = useCanEdit();
  const releases = releasesQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Releases</h1>
        {canEdit ? (
          <Button size="sm" className="ml-auto rounded-full" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New release
          </Button>
        ) : null}
      </div>

      {releasesQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-2xl" />
          ))}
        </div>
      )}

      {releasesQuery.isError && (
        <div className="rounded-2xl border border-transparent bg-surface p-6 shadow-card">
          <p className="text-sm text-body-ink">Couldn't load releases.</p>
          <Button
            className="mt-4 rounded-full"
            variant="outline"
            onClick={() => void releasesQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {releases && releases.length === 0 && (
        <div className="rounded-2xl border border-transparent bg-surface p-10 text-center shadow-card">
          <p className="text-sm text-muted-ink">
            No releases yet — bundle features into your first one.
          </p>
          {canEdit ? (
            <Button className="mt-4 rounded-full" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New release
            </Button>
          ) : null}
        </div>
      )}

      {releases && releases.length > 0 && (
        <div className="space-y-3">
          {releases.map((release) => (
            <ReleaseCard key={release.id} release={release} />
          ))}
        </div>
      )}

      <NewReleaseDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
