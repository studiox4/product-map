import { useNavigate } from 'react-router-dom';
import { addDays, differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';
import { HORIZON_COLORS, type FeatureWithDocs } from '@productmap/shared';

const WIDTH = 1000;
const GUTTER = 220;
const ROW_H = 28;
const BAR_H = 14;
const PAD_Y = 8;

/** Read-only compact Gantt: one row per dated feature, bars colored by horizon, today line. */
export function GanttHero({ features }: { features: FeatureWithDocs[] }) {
  const navigate = useNavigate();
  const dated = features.filter((f) => f.startDate && f.endDate);

  if (dated.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground shadow-sm">
        No scheduled features yet — add dates on the board to see them here.
      </div>
    );
  }

  const starts = dated.map((f) => parseISO(f.startDate!));
  const ends = dated.map((f) => parseISO(f.endDate!));
  const viewStart = addDays(new Date(Math.min(...starts.map((d) => d.getTime()))), -7);
  const viewEnd = addDays(new Date(Math.max(...ends.map((d) => d.getTime()))), 7);
  const totalDays = Math.max(1, differenceInCalendarDays(viewEnd, viewStart));
  const plotWidth = WIDTH - GUTTER;
  const x = (date: Date) =>
    GUTTER + (differenceInCalendarDays(date, viewStart) / totalDays) * plotWidth;

  const height = dated.length * ROW_H + PAD_Y * 2;
  const today = startOfDay(new Date());
  const todayX = x(today);
  const todayVisible = todayX >= GUTTER && todayX <= WIDTH;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full"
        role="img"
        aria-label="Roadmap timeline"
      >
        {dated.map((f, i) => {
          const y = PAD_Y + i * ROW_H;
          const barX = x(parseISO(f.startDate!));
          const barW = Math.max(4, x(parseISO(f.endDate!)) - barX);
          return (
            <g key={f.id}>
              <text
                x={0}
                y={y + ROW_H / 2}
                dominantBaseline="middle"
                className="fill-slate-600 text-[12px]"
              >
                {f.title.length > 32 ? `${f.title.slice(0, 31)}…` : f.title}
              </text>
              <rect
                data-testid="gantt-hero-bar"
                x={barX}
                y={y + (ROW_H - BAR_H) / 2}
                width={barW}
                height={BAR_H}
                rx={4}
                fill={HORIZON_COLORS[f.horizon].bar}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onClick={() => navigate(`/roadmap?feature=${f.id}`)}
              >
                <title>{`${f.title} (${f.startDate} → ${f.endDate})`}</title>
              </rect>
            </g>
          );
        })}
        {todayVisible && (
          <line
            data-testid="gantt-hero-today"
            x1={todayX}
            y1={0}
            x2={todayX}
            y2={height}
            stroke="#dc2626"
            strokeWidth={1.5}
          />
        )}
      </svg>
    </div>
  );
}

export default GanttHero;
