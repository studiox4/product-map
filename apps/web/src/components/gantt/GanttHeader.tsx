import { HEADER_HEIGHT, monthTicks, weekTicks } from './gantt-math';

interface GanttHeaderProps {
  viewStart: string;
  totalDays: number;
  pxPerDay: number;
  /** Total svg height — gridlines run from the header down through the plot. */
  chartHeight: number;
}

/** Month labels + month/week gridlines. Rendered inside the plot's translated group. */
export function GanttHeader({ viewStart, totalDays, pxPerDay, chartHeight }: GanttHeaderProps) {
  const months = monthTicks(viewStart, totalDays, pxPerDay);
  const weeks = weekTicks(viewStart, totalDays, pxPerDay);
  return (
    <g data-testid="gantt-header">
      {weeks.map((x) => (
        <line key={`w${x}`} x1={x} y1={HEADER_HEIGHT} x2={x} y2={chartHeight} stroke="#f1f5f9" strokeWidth={1} />
      ))}
      {months.map((m) => (
        <g key={m.label}>
          <line x1={m.x} y1={12} x2={m.x} y2={chartHeight} stroke="#e2e8f0" strokeWidth={1} />
          <text x={m.x + 6} y={24} fontSize={11} fill="#64748b">
            {m.label}
          </text>
        </g>
      ))}
      <line x1={0} y1={HEADER_HEIGHT} x2={totalDays * pxPerDay} y2={HEADER_HEIGHT} stroke="#e2e8f0" strokeWidth={1} />
    </g>
  );
}
