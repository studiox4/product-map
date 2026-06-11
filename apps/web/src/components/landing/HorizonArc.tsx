import { useMemo } from 'react';
import { HORIZON_COLORS, HORIZONS, type Horizon } from '@productmap/shared';
import { HORIZON_LABELS } from '@/components/HorizonBadge';
import { donutSegments } from './viz-math';

const SIZE = 28;
const STROKE = 5;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/** Small donut of feature distribution across horizons (panel-header accessory). */
export function HorizonArc({ features }: { features: { horizon: Horizon }[] }) {
  const counts = useMemo(
    () => HORIZONS.map((h) => features.filter((f) => f.horizon === h).length),
    [features],
  );
  const segments = donutSegments(counts, C);
  const label = HORIZONS.map((h, i) => `${HORIZON_LABELS[h]} ${counts[i]}`).join(', ');

  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <svg
        data-testid="horizon-arc"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label={`Features by horizon: ${label}`}
        className="-rotate-90"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--pm-wash)"
          strokeWidth={STROKE}
        />
        {HORIZONS.map((h, i) =>
          segments[i].length > 0 ? (
            <circle
              key={h}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={HORIZON_COLORS[h].bar}
              strokeWidth={STROKE}
              strokeDasharray={`${segments[i].length} ${C - segments[i].length}`}
              strokeDashoffset={-segments[i].offset}
            />
          ) : null,
        )}
      </svg>
      <span className="text-xs font-medium text-muted-ink">{features.length}</span>
    </span>
  );
}

export default HorizonArc;
