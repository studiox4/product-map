import { useMemo } from 'react';
import { sparklinePath, weeklyBuckets, type TimedEvent } from './viz-math';

const WEEKS = 8;
const WIDTH = 140;
const HEIGHT = 36;
const PAD = 4;

/** Inline sparkline of activity events per week over the last 8 weeks (action color). */
export function VelocitySparkline({ events }: { events: TimedEvent[] }) {
  const { counts, path, lastY } = useMemo(() => {
    const counts = weeklyBuckets(events, WEEKS);
    const path = sparklinePath(counts, WIDTH, HEIGHT, PAD);
    const max = Math.max(...counts);
    const lastY =
      max === 0 ? HEIGHT - PAD : PAD + (1 - counts[WEEKS - 1] / max) * (HEIGHT - PAD * 2);
    return { counts, path, lastY };
  }, [events]);

  const total = counts.reduce((a, b) => a + b, 0);

  return (
    <div
      className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-2.5 shadow-sm-card"
      title={`${total} event${total === 1 ? '' : 's'} in the last ${WEEKS} weeks`}
    >
      <svg
        data-testid="velocity-sparkline"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={`Velocity: ${total} activity events in the last ${WEEKS} weeks`}
        className="shrink-0"
      >
        <path
          d={`${path} L${WIDTH},${HEIGHT - 1} L0,${HEIGHT - 1} Z`}
          fill="var(--pm-action)"
          opacity={0.08}
        />
        <path
          d={path}
          fill="none"
          stroke="var(--pm-action)"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={WIDTH} cy={lastY} r={2.5} fill="var(--pm-action)" />
      </svg>
      <div className="leading-tight">
        <div className="font-display text-sm font-semibold text-ink">{counts[WEEKS - 1]}</div>
        <div className="text-[11px] text-muted-ink">events this week</div>
      </div>
    </div>
  );
}

export default VelocitySparkline;
