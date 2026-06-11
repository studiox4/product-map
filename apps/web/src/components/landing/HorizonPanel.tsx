import { Link, useNavigate } from 'react-router-dom';
import { HORIZON_COLORS, type FeatureWithDocs, type Horizon } from '@productmap/shared';
import { HORIZON_LABELS } from '@/components/HorizonBadge';
import StatusBadge from '@/components/StatusBadge';

const TOP_N = 3;

export function HorizonPanel({
  horizon,
  features,
}: {
  horizon: Horizon;
  features: FeatureWithDocs[];
}) {
  const navigate = useNavigate();
  const sorted = [...features].sort((a, b) => a.sortOrder - b.sortOrder);
  const top = sorted.slice(0, TOP_N);
  const moreCount = sorted.length - top.length;

  return (
    <section className="flex flex-col rounded-2xl border border-transparent bg-surface shadow-card transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: HORIZON_COLORS[horizon].bar }}
            aria-hidden
          />
          {HORIZON_LABELS[horizon]}
        </h2>
        <span className="inline-flex items-center rounded-full bg-wash px-2 py-0.5 text-xs font-medium text-muted-ink">
          {sorted.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-2 pb-3">
        {top.length === 0 && (
          <p className="px-2 py-2 text-sm text-muted-foreground">Nothing here yet</p>
        )}
        {top.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => navigate(`/board?feature=${f.id}`)}
            className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-body-ink outline-none transition-colors duration-150 ease-out hover:bg-wash focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">{f.title}</span>
            <StatusBadge status={f.status} />
          </button>
        ))}
        {moreCount > 0 && (
          <Link
            to="/board"
            className="rounded-xl px-2 py-1.5 text-sm text-muted-foreground outline-none transition-colors duration-150 ease-out hover:bg-wash hover:text-body-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            +{moreCount} more
          </Link>
        )}
      </div>
    </section>
  );
}

export default HorizonPanel;
