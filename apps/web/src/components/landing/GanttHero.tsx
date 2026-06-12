import { useNavigate } from 'react-router-dom';
import {
  addDays,
  differenceInCalendarDays,
  eachMonthOfInterval,
  format,
  parseISO,
  startOfDay,
} from 'date-fns';
import { HORIZON_COLORS, type FeatureWithDocs } from '@productmap/shared';

const WIDTH = 1000;
const GUTTER = 220;
const ROW_H = 28;
const BAR_H = 14;
const PAD_Y = 8;
const LABEL_H = 40; // headroom for the "today" pill + month labels

/** Read-only compact Gantt: one row per dated feature, bars colored by horizon, today line. */
export function GanttHero({ features }: { features: FeatureWithDocs[] }) {
  const navigate = useNavigate();
  const dated = features.filter((f) => f.startDate && f.endDate);

  if (dated.length === 0) {
    return (
      <div className="rounded-2xl border border-transparent bg-surface p-6 text-sm text-muted-foreground shadow-card">
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

  const months = eachMonthOfInterval({ start: viewStart, end: viewEnd }).filter(
    (m) => x(m) >= GUTTER && x(m) <= WIDTH - 24,
  );

  const height = LABEL_H + dated.length * ROW_H + PAD_Y * 2;
  const today = startOfDay(new Date());
  const todayX = x(today);
  const todayVisible = todayX >= GUTTER && todayX <= WIDTH;
  const pillW = 44;
  const pillX = Math.min(Math.max(todayX - pillW / 2, GUTTER), WIDTH - pillW);

  return (
    <div className="rounded-2xl border border-transparent bg-surface p-5 shadow-card transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-card-hover">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full"
        role="img"
        aria-label="Roadmap timeline"
      >
        {months.map((m) => {
          const mx = x(m);
          return (
            <g key={m.toISOString()}>
              <line
                x1={mx}
                y1={LABEL_H - 4}
                x2={mx}
                y2={height}
                stroke="var(--pm-line)"
                strokeWidth={1}
              />
              <text
                x={mx + 4}
                y={LABEL_H - 10}
                className="fill-[var(--pm-muted)] text-[10px] font-medium"
              >
                {format(m, 'MMM')}
              </text>
            </g>
          );
        })}
        {dated.map((f, i) => {
          const y = LABEL_H + PAD_Y + i * ROW_H;
          const barX = x(parseISO(f.startDate!));
          const barW = Math.max(BAR_H, x(parseISO(f.endDate!)) - barX);
          return (
            <g key={f.id}>
              <text
                x={0}
                y={y + ROW_H / 2}
                dominantBaseline="middle"
                className="fill-[var(--pm-body)] text-[12px]"
              >
                {f.title.length > 32 ? `${f.title.slice(0, 31)}…` : f.title}
              </text>
              <rect
                data-testid="gantt-hero-bar"
                x={barX}
                y={y + (ROW_H - BAR_H) / 2}
                width={barW}
                height={BAR_H}
                rx={BAR_H / 2}
                fill={HORIZON_COLORS[f.horizon].bar}
                style={{ filter: 'drop-shadow(0 2px 3px var(--pm-bar-shadow))' }}
                className="cursor-pointer transition-opacity duration-150 ease-out hover:opacity-80"
                onClick={() => navigate(`/roadmap?feature=${f.id}`)}
              >
                <title>{`${f.title} (${f.startDate} → ${f.endDate})`}</title>
              </rect>
            </g>
          );
        })}
        {todayVisible && (
          <g>
            <line
              data-testid="gantt-hero-today"
              x1={todayX}
              y1={LABEL_H - 4}
              x2={todayX}
              y2={height}
              stroke="var(--pm-action)"
              strokeOpacity={0.4}
              strokeWidth={1.5}
            />
            <rect
              x={pillX}
              y={1}
              width={pillW}
              height={16}
              rx={8}
              fill="var(--pm-action-soft)"
            />
            <text
              x={pillX + pillW / 2}
              y={9.5}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-[var(--pm-action)] text-[10px] font-medium"
            >
              today
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export default GanttHero;
