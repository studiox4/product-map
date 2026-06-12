import { Link } from 'react-router-dom';
import { MoreHorizontal, Pencil, Target, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  HORIZONS,
  type Feature,
  type Horizon,
  type Objective,
  type ObjectiveStatus,
} from '@productmap/shared';
import { useUpdateObjective } from '@/lib/api';
import { cn } from '@/lib/utils';
import { HORIZON_LABELS } from '@/components/HorizonBadge';
import StatusBadge from '@/components/StatusBadge';
import UserAvatar from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OBJECTIVE_STATUS_LABELS } from './ObjectiveDialog';

/** on_track sage / at_risk warm / achieved action / dropped slate (spec §3). */
const OBJECTIVE_STATUS_CLASSES: Record<ObjectiveStatus, string> = {
  on_track: 'bg-sage-soft text-sage',
  at_risk: 'bg-warm-soft text-warm',
  achieved: 'bg-action-soft text-action',
  dropped: 'bg-[#e2e8f0] text-[#475569]',
};

export function ObjectiveStatusPill({ status }: { status: ObjectiveStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        OBJECTIVE_STATUS_CLASSES[status],
      )}
    >
      {OBJECTIVE_STATUS_LABELS[status]}
    </span>
  );
}

/** Compact read-only feature row inside an objective card / the unassigned tray. */
export function FeatureMiniRow({ feature }: { feature: Feature }) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <Link
        to={`/features/${feature.id}`}
        className="min-w-0 flex-1 truncate text-sm font-medium text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {feature.title}
      </Link>
      {feature.size ? (
        <span className="inline-flex items-center rounded-full bg-wash px-1.5 py-0.5 text-[11px] font-medium uppercase text-body-ink">
          {feature.size}
        </span>
      ) : null}
      <StatusBadge status={feature.status} />
    </li>
  );
}

/**
 * Objective card (Dream tier D9 + tier 2 §3): owner avatar, status pill,
 * metric → target → current progress line, ⋯ edit/drop menu, and this
 * objective's features as mini-rows grouped by horizon.
 */
export function ObjectiveCard({
  objective,
  features,
  onEdit,
}: {
  objective: Objective;
  features: Feature[];
  onEdit?: (objective: Objective) => void;
}) {
  const updateObjective = useUpdateObjective();

  const byHorizon = new Map<Horizon, Feature[]>(
    HORIZONS.map((h) => [h, features.filter((f) => f.horizon === h)]),
  );

  const drop = () => {
    if (updateObjective.isPending) return;
    updateObjective.mutate(
      { id: objective.id, status: 'dropped' },
      {
        onSuccess: () => toast.success(`Dropped '${objective.title}'`),
        onError: () => toast.error(`Couldn't drop '${objective.title}'`),
      },
    );
  };

  return (
    <article className="rounded-2xl border border-transparent bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-action-soft text-action">
          <Target className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate font-display text-base font-semibold text-ink">
              {objective.title}
            </h2>
            <ObjectiveStatusPill status={objective.status} />
            {objective.owner ? <UserAvatar user={objective.owner} size="sm" /> : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  aria-label={`Objective actions for ${objective.title}`}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit?.(objective)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={drop} disabled={objective.status === 'dropped'}>
                  <XCircle className="h-3.5 w-3.5" aria-hidden />
                  Drop
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-ink">
            {objective.metric ? <span>{objective.metric}</span> : null}
            {objective.target ? (
              <span className="font-medium text-body-ink">→ {objective.target}</span>
            ) : null}
            {objective.current ? (
              <span>
                now <span className="font-medium text-body-ink">{objective.current}</span>
              </span>
            ) : null}
            {objective.quarter ? (
              <span className="inline-flex items-center rounded-full bg-wash px-2 py-0.5 font-medium text-body-ink">
                {objective.quarter}
              </span>
            ) : null}
          </div>
          {objective.descriptionMd ? (
            <p className="mt-1.5 line-clamp-2 text-sm text-body-ink">{objective.descriptionMd}</p>
          ) : null}
        </div>
      </div>

      {features.length === 0 ? (
        <p className="mt-4 text-sm text-muted-ink">
          No features yet — assign one from its page rail.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {HORIZONS.map((horizon) => {
            const group = byHorizon.get(horizon) ?? [];
            if (group.length === 0) return null;
            return (
              <div key={horizon}>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-ink">
                  {HORIZON_LABELS[horizon]}
                </h3>
                <ul className="mt-1 divide-y divide-line">
                  {group.map((feature) => (
                    <FeatureMiniRow key={feature.id} feature={feature} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

export default ObjectiveCard;
