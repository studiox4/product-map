import { useMemo, type ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import {
  heatmapWeeks,
  intensityLevel,
  intensityThresholds,
  type TimedEvent,
} from './viz-math';

const WEEKS = 12;

/** Action-color fills per intensity level (0 = quiet day), themed via CSS vars for both modes. */
const LEVEL_FILLS = [
  'var(--pm-wash)',
  'color-mix(in srgb, var(--pm-action) 25%, transparent)',
  'color-mix(in srgb, var(--pm-action) 45%, transparent)',
  'color-mix(in srgb, var(--pm-action) 70%, transparent)',
  'var(--pm-action)',
] as const;

/**
 * "Pulse" panel: GitHub-style 12-week activity calendar.
 * `headerAccessory` slots extra viz (the horizon arc) into the panel header.
 */
export function PulseHeatmap({
  events,
  headerAccessory,
}: {
  events: TimedEvent[];
  headerAccessory?: ReactNode;
}) {
  const { weeks, thresholds } = useMemo(() => {
    const weeks = heatmapWeeks(events, WEEKS);
    const thresholds = intensityThresholds(
      weeks.flat().filter((d) => !d.future).map((d) => d.count),
    );
    return { weeks, thresholds };
  }, [events]);

  return (
    <section className="flex flex-col rounded-2xl border border-transparent bg-surface shadow-card transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="font-display text-sm font-semibold text-ink">Pulse</h2>
        {headerAccessory}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-4 pb-4">
        <div
          data-testid="pulse-heatmap"
          role="img"
          aria-label={`Activity over the last ${WEEKS} weeks`}
          className="grid auto-cols-fr grid-flow-col grid-rows-[repeat(7,minmax(0,1fr))] gap-[3px]"
        >
          {weeks.flat().map((day) =>
            day.future ? (
              <span key={day.date} className="aspect-square w-full rounded-[3px]" aria-hidden />
            ) : (
              <span
                key={day.date}
                data-testid="pulse-day"
                data-level={intensityLevel(day.count, thresholds)}
                title={`${day.count} event${day.count === 1 ? '' : 's'} on ${format(parseISO(day.date), 'MMM d')}`}
                className="aspect-square w-full rounded-[3px]"
                style={{ backgroundColor: LEVEL_FILLS[intensityLevel(day.count, thresholds)] }}
              />
            ),
          )}
        </div>
        <div className="flex items-center justify-end gap-1 text-[10px] text-muted-ink">
          less
          {LEVEL_FILLS.map((fill, i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-[2px]"
              style={{ backgroundColor: fill }}
              aria-hidden
            />
          ))}
          more
        </div>
      </div>
    </section>
  );
}

export default PulseHeatmap;
