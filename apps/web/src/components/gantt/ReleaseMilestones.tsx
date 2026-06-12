// Release milestones on the gantt: a diamond at each release's target date
// with a name label — sage when shipped, muted while planned (Dream Tier D7).
import type { Release } from '@productmap/shared';
import { HEADER_HEIGHT, dateToX } from './gantt-math';

const DIAMOND_R = 5;
const DIAMOND_CY = HEADER_HEIGHT - 10;

export interface ReleaseMilestonesProps {
  releases: Release[];
  viewStart: string;
  pxPerDay: number;
  chartHeight: number;
  /** Plot width (px) — milestones outside the window are skipped. */
  plotWidth: number;
}

/** Renders inside the plot <g> (already translated past the gutter). */
export function ReleaseMilestones({
  releases,
  viewStart,
  pxPerDay,
  chartHeight,
  plotWidth,
}: ReleaseMilestonesProps) {
  const dated = releases
    .filter((r) => r.targetDate)
    .map((r) => ({ ...r, x: dateToX(r.targetDate!, viewStart, pxPerDay) }))
    .filter((r) => r.x >= 0 && r.x <= plotWidth);
  if (dated.length === 0) return null;

  return (
    <g data-testid="gantt-release-milestones" pointerEvents="none">
      {dated.map((r) => {
        const shipped = r.status === 'shipped';
        const color = shipped ? 'var(--pm-sage)' : 'var(--pm-muted)';
        return (
          <g
            key={r.id}
            data-testid={`gantt-milestone-${r.id}`}
            data-release-status={r.status}
          >
            <line
              x1={r.x}
              y1={HEADER_HEIGHT}
              x2={r.x}
              y2={chartHeight}
              stroke={color}
              strokeOpacity={0.35}
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <rect
              x={r.x - DIAMOND_R}
              y={DIAMOND_CY - DIAMOND_R}
              width={DIAMOND_R * 2}
              height={DIAMOND_R * 2}
              transform={`rotate(45 ${r.x} ${DIAMOND_CY})`}
              fill={shipped ? 'var(--pm-sage)' : 'rgb(var(--pm-surface-rgb))'}
              stroke={color}
              strokeWidth={1.5}
            />
            <text
              x={r.x + DIAMOND_R + 5}
              y={DIAMOND_CY + 3.5}
              fontSize={10}
              fontWeight={600}
              fill={color}
              className="select-none"
            >
              {r.name}
              <title>
                {r.name} — {shipped ? 'shipped' : `target ${r.targetDate}`}
              </title>
            </text>
          </g>
        );
      })}
    </g>
  );
}
