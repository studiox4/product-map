import { toast } from 'sonner';
import type { FeatureWithDocs } from '@productmap/shared';
import { useObjectives, useReleases, useUpdateFeature } from '@/lib/api';
import { Label } from '@productmap/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@productmap/ui';

const NONE = '__none__';

/**
 * Right-rail Planning card (D7/D9): assign the feature to an objective
 * (drives /outcomes grouping) and to a release (drives release bundles).
 */
export function PlanningRail({ feature }: { feature: FeatureWithDocs }) {
  const objectives = useObjectives().data ?? [];
  const releases = useReleases().data ?? [];
  const updateFeature = useUpdateFeature();

  const assign = (patch: { objectiveId?: string | null; releaseId?: string | null }) => {
    updateFeature.mutate(
      { id: feature.id, ...patch },
      { onError: () => toast.error(`Couldn't update '${feature.title}' — restored`) },
    );
  };

  return (
    <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-card" aria-label="Planning">
      <h2 className="font-display text-sm font-semibold text-ink">Planning</h2>
      <div className="space-y-2">
        <Label htmlFor="feature-objective" className="text-xs font-medium text-muted-ink">
          Objective
        </Label>
        <Select
          value={feature.objectiveId ?? NONE}
          onValueChange={(v) => assign({ objectiveId: v === NONE ? null : v })}
        >
          <SelectTrigger
            id="feature-objective"
            aria-label="Objective"
            className="rounded-full border-transparent bg-inset px-4 transition-colors duration-150 ease-out focus-visible:bg-surface"
          >
            <SelectValue placeholder="No objective" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No objective</SelectItem>
            {objectives.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="feature-release" className="text-xs font-medium text-muted-ink">
          Release
        </Label>
        <Select
          value={feature.releaseId ?? NONE}
          onValueChange={(v) => assign({ releaseId: v === NONE ? null : v })}
        >
          <SelectTrigger
            id="feature-release"
            aria-label="Release"
            className="rounded-full border-transparent bg-inset px-4 transition-colors duration-150 ease-out focus-visible:bg-surface"
          >
            <SelectValue placeholder="No release" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No release</SelectItem>
            {releases.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}

export default PlanningRail;
