// Capacity strip beneath the gantt rows: per-month load vs capacity, with a
// warm wash + warning chip on overcommitted months (Dream Tier D6).
import type { MonthLoad } from './capacity-math';
import { dateToX } from './gantt-math';

export const CAPACITY_STRIP_HEIGHT = 34;

function fmtWeeks(w: number): string {
  return `${Math.round(w * 10) / 10}w`;
}

export interface CapacityStripProps {
  months: MonthLoad[];
  viewStart: string;
  pxPerDay: number;
  /** Top edge (px) of the strip inside the SVG. */
  y: number;
  /** Plot width (px) — month cells are clamped to the view window. */
  plotWidth: number;
}

/** Renders inside the plot <g> (already translated past the gutter). */
export function CapacityStrip({ months, viewStart, pxPerDay, y, plotWidth }: CapacityStripProps) {
  return (
    <g data-testid="gantt-capacity-strip">
      <line x1={0} y1={y} x2={plotWidth} y2={y} stroke="var(--pm-line-strong)" />
      {months.map((m) => {
        const rawX = dateToX(m.monthStart, viewStart, pxPerDay);
        const x = Math.max(rawX, 0);
        const width = Math.min(rawX + m.days * pxPerDay, plotWidth) - x;
        if (width <= 0) return null;
        const label = `${fmtWeeks(m.loadWeeks)} / ${fmtWeeks(m.capacityWeeks)}`;
        return (
          <g
            key={m.monthStart}
            data-testid={`capacity-month-${m.monthStart.slice(0, 7)}`}
            data-overcommitted={m.overcommitted || undefined}
          >
            <rect
              x={x}
              y={y}
              width={width}
              height={CAPACITY_STRIP_HEIGHT}
              fill={m.overcommitted ? 'var(--pm-warm-soft)' : 'var(--pm-panel)'}
            />
            <line
              x1={x}
              y1={y}
              x2={x}
              y2={y + CAPACITY_STRIP_HEIGHT}
              stroke="var(--pm-line)"
            />
            {width > 64 && (
              <text
                x={x + 8}
                y={y + 21}
                fontSize={10}
                fontWeight={600}
                fill={m.overcommitted ? 'var(--pm-warm)' : 'var(--pm-muted)'}
                className="select-none"
              >
                {label}
                <title>
                  {m.label}: {fmtWeeks(m.loadWeeks)} planned of {fmtWeeks(m.capacityWeeks)} capacity
                </title>
              </text>
            )}
            {m.overcommitted && width > 140 && (
              <g data-testid={`capacity-warning-${m.monthStart.slice(0, 7)}`}>
                <rect
                  x={x + width - 50}
                  y={y + 9}
                  width={42}
                  height={16}
                  rx={8}
                  fill="var(--pm-warm)"
                  fillOpacity={0.15}
                />
                <text
                  x={x + width - 29}
                  y={y + 20.5}
                  fontSize={9}
                  fontWeight={700}
                  fill="var(--pm-warm)"
                  textAnchor="middle"
                  className="select-none"
                >
                  Over
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
