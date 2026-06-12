import { useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import type { Feature, Release } from '@productmap/shared';
import { monthlyLoads } from './capacity-math';
import { CAPACITY_STRIP_HEIGHT, CapacityStrip } from './CapacityStrip';
import { DependencyArrows, type DependencyEdge } from './DependencyArrows';
import { GanttBar } from './GanttBar';
import { GanttHeader } from './GanttHeader';
import { ReleaseMilestones } from './ReleaseMilestones';
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
  /** Release milestones (diamond at target date; sage when shipped). Always on. */
  releases?: Release[];
  /** Workspace dependency edges — drawn as bezier arrows between bars. Always on. */
  dependencyEdges?: DependencyEdge[];
  /** Show the per-month capacity strip beneath the rows. */
  showCapacity?: boolean;
}

export function GanttChart({
  features,
  onCommitDates,
  onBarClick,
  highlightId,
  trayDropActive,
  releases = [],
  dependencyEdges = [],
  showCapacity = false,
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
  const rowsBottom = HEADER_HEIGHT + Math.max(dated.length, 1) * ROW_HEIGHT;
  const chartHeight = rowsBottom + (showCapacity ? CAPACITY_STRIP_HEIGHT : 0);
  const todayX = dateToX(format(new Date(), 'yyyy-MM-dd'), viewStart, PX_PER_DAY);

  const capacityMonths = useMemo(
    () => (showCapacity ? monthlyLoads(dated, viewStart, totalDays) : []),
    [showCapacity, dated, viewStart, totalDays],
  );

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
      <div className="rounded-2xl border border-transparent bg-card p-12 text-center shadow-card">
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
      className={`overflow-x-auto rounded-2xl border border-transparent bg-card shadow-card transition-shadow duration-150 ease-out ${
        trayDropActive ? 'ring-2 ring-action/60' : ''
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
                  fill="var(--pm-action-soft)"
                  className="animate-pulse"
                />
              )}
              {/* Full-row hover wash */}
              <rect
                x={0}
                y={y}
                width={GUTTER_WIDTH + plotWidth}
                height={ROW_HEIGHT}
                className="fill-transparent transition-[fill] duration-150 ease-out hover:fill-[var(--pm-panel)]"
              />
              <line
                x1={0}
                y1={y + ROW_HEIGHT}
                x2={GUTTER_WIDTH + plotWidth}
                y2={y + ROW_HEIGHT}
                stroke="var(--pm-line)"
              />
              <text
                x={16}
                y={y + ROW_HEIGHT / 2 + 4}
                fontSize={12}
                fontWeight={500}
                fill="var(--pm-ink)"
                className="pointer-events-none select-none"
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
          {/* Today line — soft blue with a pill label */}
          <line
            data-testid="gantt-today-line"
            x1={todayX}
            y1={16}
            x2={todayX}
            y2={rowsBottom}
            stroke="var(--pm-action)"
            strokeOpacity={0.45}
            strokeWidth={1.5}
          />
          <g pointerEvents="none">
            <rect x={todayX - 23} y={1} width={46} height={16} rx={8} fill="var(--pm-action-soft)" />
            <text
              x={todayX}
              y={12}
              fontSize={10}
              fontWeight={600}
              fill="var(--pm-action)"
              textAnchor="middle"
            >
              Today
            </text>
          </g>
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
          <DependencyArrows
            features={dated}
            edges={dependencyEdges}
            viewStart={viewStart}
            pxPerDay={PX_PER_DAY}
          />
          <ReleaseMilestones
            releases={releases}
            viewStart={viewStart}
            pxPerDay={PX_PER_DAY}
            chartHeight={rowsBottom}
            plotWidth={plotWidth}
          />
          {showCapacity && (
            <CapacityStrip
              months={capacityMonths}
              viewStart={viewStart}
              pxPerDay={PX_PER_DAY}
              y={rowsBottom}
              plotWidth={plotWidth}
            />
          )}
        </g>
        <line x1={GUTTER_WIDTH} y1={0} x2={GUTTER_WIDTH} y2={chartHeight} stroke="var(--pm-line)" />
      </svg>
    </div>
  );
}
