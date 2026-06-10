import { useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import type { Feature } from '@productmap/shared';
import { GanttBar } from './GanttBar';
import { GanttHeader } from './GanttHeader';
import {
  GUTTER_WIDTH,
  HEADER_HEIGHT,
  PX_PER_DAY,
  ROW_HEIGHT,
  barRect,
  computeViewRange,
  dateToX,
} from './gantt-math';

export interface GanttChartProps {
  features: Feature[];
  /** Move → { startDate, endDate }; resize → { endDate }. */
  onCommitDates: (feature: Feature, patch: { startDate?: string; endDate?: string }) => void;
  onBarClick: (feature: Feature) => void;
  /** Scroll-into-view + pulse this feature (deep link via ?feature=). */
  highlightId?: string | null;
  /** A tray chip is being dragged — show the drop highlight ring. */
  trayDropActive?: boolean;
}

export function GanttChart({
  features,
  onCommitDates,
  onBarClick,
  highlightId,
  trayDropActive,
}: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const dated = useMemo(
    () =>
      features
        .filter((f) => f.startDate && f.endDate)
        .sort((a, b) => a.startDate!.localeCompare(b.startDate!) || a.title.localeCompare(b.title)),
    [features],
  );

  const { viewStart, totalDays } = useMemo(() => computeViewRange(dated), [dated]);

  const plotWidth = totalDays * PX_PER_DAY;
  const chartHeight = HEADER_HEIGHT + Math.max(dated.length, 1) * ROW_HEIGHT;
  const todayX = dateToX(format(new Date(), 'yyyy-MM-dd'), viewStart, PX_PER_DAY);

  // Deep link: scroll the highlighted feature's bar into view.
  useEffect(() => {
    if (!highlightId) return;
    const idx = dated.findIndex((f) => f.id === highlightId);
    if (idx === -1) return;
    const container = containerRef.current;
    const rect = barRect(dated[idx], viewStart, PX_PER_DAY, idx);
    if (container && rect) {
      container.scrollTo?.({
        left: Math.max(rect.x - container.clientWidth / 2 + GUTTER_WIDTH, 0),
        behavior: 'smooth',
      });
      container.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }
  }, [highlightId, dated, viewStart]);

  if (dated.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">
          No scheduled features yet — drag a feature from the unscheduled tray below onto the
          timeline to give it dates.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-x-auto rounded-lg border bg-card shadow-sm transition-colors duration-150 ease-out ${
        trayDropActive ? 'ring-2 ring-primary' : ''
      }`}
    >
      <svg
        data-gantt-plot
        data-view-start={viewStart}
        width={GUTTER_WIDTH + plotWidth}
        height={chartHeight}
        role="img"
        aria-label="Roadmap gantt chart"
      >
        {/* Row backgrounds + labels (left gutter) */}
        {dated.map((f, i) => {
          const y = HEADER_HEIGHT + i * ROW_HEIGHT;
          const highlighted = f.id === highlightId;
          return (
            <g key={f.id} data-gantt-row={f.id}>
              {highlighted && (
                <rect
                  x={0}
                  y={y}
                  width={GUTTER_WIDTH + plotWidth}
                  height={ROW_HEIGHT}
                  fill="#fef3c7"
                  className="animate-pulse"
                />
              )}
              <line
                x1={0}
                y1={y + ROW_HEIGHT}
                x2={GUTTER_WIDTH + plotWidth}
                y2={y + ROW_HEIGHT}
                stroke="#f1f5f9"
              />
              <text
                x={12}
                y={y + ROW_HEIGHT / 2 + 4}
                fontSize={12}
                fill="#0f172a"
                className="select-none"
              >
                {f.title.length > 26 ? `${f.title.slice(0, 25)}…` : f.title}
                <title>{f.title}</title>
              </text>
            </g>
          );
        })}

        {/* Plot area, shifted right of the gutter */}
        <g transform={`translate(${GUTTER_WIDTH},0)`}>
          <GanttHeader
            viewStart={viewStart}
            totalDays={totalDays}
            pxPerDay={PX_PER_DAY}
            chartHeight={chartHeight}
          />
          {/* Today line */}
          <line
            data-testid="gantt-today-line"
            x1={todayX}
            y1={16}
            x2={todayX}
            y2={chartHeight}
            stroke="#dc2626"
            strokeWidth={1.5}
          />
          <text x={todayX + 4} y={12} fontSize={10} fill="#dc2626">
            Today
          </text>
          {dated.map((f, i) => {
            const rect = barRect(f, viewStart, PX_PER_DAY, i);
            if (!rect) return null;
            return (
              <GanttBar
                key={f.id}
                feature={f}
                rect={{ ...rect, y: rect.y + HEADER_HEIGHT }}
                pxPerDay={PX_PER_DAY}
                onCommit={onCommitDates}
                onClick={onBarClick}
                highlighted={f.id === highlightId}
              />
            );
          })}
        </g>
        <line x1={GUTTER_WIDTH} y1={0} x2={GUTTER_WIDTH} y2={chartHeight} stroke="#e2e8f0" />
      </svg>
    </div>
  );
}
