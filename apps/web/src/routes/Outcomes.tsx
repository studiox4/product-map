import { useState } from 'react';
import { Inbox, Plus } from 'lucide-react';
import type { Objective } from '@productmap/shared';
import { useFeatures, useObjectives } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ObjectiveCard, FeatureMiniRow } from '@/components/outcomes/ObjectiveCard';
import { ObjectiveDialog } from '@/components/outcomes/ObjectiveDialog';

/**
 * /outcomes (Dream tier D9 + tier 2 §3): objectives as cards with their
 * features grouped by horizon, plus an unassigned-features tray. Objectives
 * are created/edited here; feature assignment lives on the feature page rail.
 */
export default function Outcomes() {
  const objectivesQuery = useObjectives();
  const featuresQuery = useFeatures();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Objective | null>(null);

  const objectives = objectivesQuery.data;
  const features = featuresQuery.data;
  const isLoading = objectivesQuery.isLoading || featuresQuery.isLoading;
  const isError = objectivesQuery.isError || featuresQuery.isError;

  const unassigned = (features ?? []).filter((f) => f.objectiveId === null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (objective: Objective) => {
    setEditing(objective);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Outcomes</h1>
          <p className="mt-1 text-sm text-muted-ink">
            Objectives and the features driving them. Assign features from their page rail.
          </p>
        </div>
        <Button size="sm" className="ml-auto rounded-full" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New objective
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <div className="rounded-2xl border border-transparent bg-surface p-6 shadow-card">
          <p className="text-sm text-body-ink">Couldn't load outcomes.</p>
          <Button
            className="mt-4 rounded-full"
            variant="outline"
            onClick={() => {
              void objectivesQuery.refetch();
              void featuresQuery.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {objectives && features && (
        <>
          {objectives.length === 0 ? (
            <div className="rounded-2xl border border-transparent bg-surface p-10 text-center shadow-card">
              <p className="text-sm text-muted-ink">No objectives yet.</p>
              <Button className="mt-4 rounded-full" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                New objective
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
              {objectives.map((objective) => (
                <ObjectiveCard
                  key={objective.id}
                  objective={objective}
                  features={features.filter((f) => f.objectiveId === objective.id)}
                  onEdit={openEdit}
                />
              ))}
            </div>
          )}

          <section
            aria-label="Unassigned features"
            className="rounded-2xl border border-dashed border-line bg-wash/50 p-5"
          >
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
              <Inbox className="h-4 w-4 text-muted-ink" aria-hidden />
              Unassigned features
              <span className="inline-flex items-center rounded-full bg-wash px-2 py-0.5 text-xs font-medium text-body-ink">
                {unassigned.length}
              </span>
            </h2>
            {unassigned.length === 0 ? (
              <p className="mt-3 text-sm text-muted-ink">
                Every feature is tied to an objective. Nice.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {unassigned.map((feature) => (
                  <FeatureMiniRow key={feature.id} feature={feature} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <ObjectiveDialog open={dialogOpen} onOpenChange={setDialogOpen} objective={editing} />
    </div>
  );
}
