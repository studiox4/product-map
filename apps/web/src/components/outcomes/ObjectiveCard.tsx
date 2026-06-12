import { Link } from 'react-router-dom';
import { Target } from 'lucide-react';
import { HORIZONS, type Feature, type Horizon, type Objective } from '@productmap/shared';
import { HORIZON_LABELS } from '@/components/HorizonBadge';
import StatusBadge from '@/components/StatusBadge';

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
 * Objective card (Dream tier D9): metric/target/quarter header + this
 * objective's features as mini-rows grouped by horizon. Read-only —
 * assignment happens on the feature rail.
 */
export function ObjectiveCard({
  objective,
  features,
}: {
  objective: Objective;
  features: Feature[];
}) {
  const byHorizon = new Map<Horizon, Feature[]>(
    HORIZONS.map((h) => [h, features.filter((f) => f.horizon === h)]),
  );

  return (
    <article className="rounded-2xl border border-transparent bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-action-soft text-action">
          <Target className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold text-ink">{objective.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-ink">
            {objective.metric ? <span>{objective.metric}</span> : null}
            {objective.target ? (
              <span className="font-medium text-body-ink">→ {objective.target}</span>
            ) : null}
            {objective.quarter ? (
              <span className="inline-flex items-center rounded-full bg-wash px-2 py-0.5 font-medium text-body-ink">
                {objective.quarter}
              </span>
            ) : null}
          </div>
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
