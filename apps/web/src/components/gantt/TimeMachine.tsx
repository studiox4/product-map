import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Pause, Play, Undo2 } from 'lucide-react';
import type { WorkspaceActivityItem } from '@productmap/shared';
import { prefersReducedMotion } from '@/lib/delight';
import { Button } from '@productmap/ui';
import { densityBuckets, monthMarks } from './history-replay';

const SWEEP_MS = 4000; // Play ▸ full sweep duration (Spec 2.1)
const DENSITY_BUCKETS = 48;

export interface TimeMachineProps {
  /** Workspace activity, ascending (drives the density dots). */
  events: WorkspaceActivityItem[];
  /** Scrub position, epoch ms. */
  value: number;
  range: { start: number; end: number };
  onChange: (timeMs: number) => void;
  /** Exit Time Machine mode and restore the live roadmap. */
  onBackToNow: () => void;
}

/**
 * Scrub bar for the Roadmap Time Machine: a timeline-styled range slider with
 * month ticks, event-density dots, a date chip riding the thumb, and a Play
 * button that sweeps the full range in ~4s via requestAnimationFrame.
 */
export function TimeMachine({ events, value, range, onChange, onBackToNow }: TimeMachineProps) {
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number>();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const span = Math.max(range.end - range.start, 1);
  const pct = Math.min(Math.max(((value - range.start) / span) * 100, 0), 100);

  const marks = useMemo(() => monthMarks(range.start, range.end), [range.start, range.end]);
  const buckets = useMemo(
    () => densityBuckets(events, range.start, range.end, DENSITY_BUCKETS),
    [events, range.start, range.end],
  );
  const maxBucket = Math.max(...buckets, 1);

  function stopPlayback() {
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
    setPlaying(false);
  }

  function startPlayback() {
    // Restart from the beginning when already parked at (or near) now.
    const fromPct = pct >= 99.5 ? 0 : pct / 100;
    const startedAt = performance.now() - fromPct * SWEEP_MS;
    const reduced = prefersReducedMotion();
    setPlaying(true);
    const tick = (t: number) => {
      let p = Math.min((t - startedAt) / SWEEP_MS, 1);
      // Reduced motion: coarse discrete steps instead of a continuous glide.
      if (reduced) p = Math.min(Math.ceil(p * 8) / 8, 1);
      onChangeRef.current(range.start + p * span);
      if (p >= 1) {
        stopPlayback();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  // Clean up any in-flight sweep on unmount.
  useEffect(() => () => {
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      data-testid="time-machine"
      className="rounded-2xl border border-transparent bg-card px-5 py-4 shadow-card"
    >
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full"
          aria-label={playing ? 'Pause history playback' : 'Play history (4 second sweep)'}
          onClick={() => (playing ? stopPlayback() : startPlayback())}
        >
          {playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
        </Button>

        {/* Track: ticks + density dots underneath, transparent native range on top */}
        <div className="relative h-12 min-w-0 flex-1">
          {/* Baseline */}
          <div className="absolute inset-x-0 top-7 h-px bg-line" aria-hidden />
          {/* Elapsed portion */}
          <div
            className="absolute top-7 h-px bg-action"
            style={{ left: 0, width: `${pct}%` }}
            aria-hidden
          />
          {/* Month ticks */}
          {marks.map((m) => (
            <div key={m.label + m.pct} aria-hidden>
              <div
                className="absolute top-[22px] h-2.5 w-px bg-line-dash"
                style={{ left: `${m.pct}%` }}
              />
              <div
                className="absolute top-9 -translate-x-1/2 text-[10px] font-medium text-muted-foreground"
                style={{ left: `${m.pct}%` }}
              >
                {m.label}
              </div>
            </div>
          ))}
          {/* Event density dots */}
          {buckets.map((count, i) =>
            count === 0 ? null : (
              <div
                key={i}
                aria-hidden
                className="absolute top-[18px] rounded-full bg-action"
                style={{
                  left: `${((i + 0.5) / DENSITY_BUCKETS) * 100}%`,
                  width: count >= maxBucket * 0.66 ? 5 : 3,
                  height: count >= maxBucket * 0.66 ? 5 : 3,
                  transform: 'translateX(-50%)',
                  opacity: 0.35 + 0.65 * (count / maxBucket),
                }}
              />
            ),
          )}
          {/* Date chip riding the thumb */}
          <div
            data-testid="time-machine-chip"
            aria-hidden
            className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-action-soft px-2.5 py-0.5 text-[11px] font-semibold text-action"
            style={{ left: `${pct}%` }}
          >
            {format(value, 'MMM d')}
          </div>
          {/* The actual slider — transparent track, visible thumb */}
          <input
            data-testid="time-machine-slider"
            type="range"
            min={range.start}
            max={range.end}
            step={Math.max(Math.round(span / 500), 1)}
            value={value}
            aria-label="Scrub roadmap history"
            aria-valuetext={format(value, 'MMMM d, yyyy')}
            onChange={(e) => {
              stopPlayback();
              onChange(Number(e.target.value));
            }}
            className="absolute inset-x-0 top-[22px] h-3 w-full cursor-ew-resize appearance-none bg-transparent outline-none [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-card [&::-moz-range-thumb]:bg-action [&::-moz-range-thumb]:shadow [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:bg-action [&::-webkit-slider-thumb]:shadow focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full"
          onClick={() => {
            stopPlayback();
            onBackToNow();
          }}
        >
          <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Back to now
        </Button>
      </div>
    </div>
  );
}
