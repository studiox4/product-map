import { useRef, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { HORIZON_COLORS, type Feature } from '@productmap/shared';
import { GUTTER_WIDTH, PX_PER_DAY, xToDate } from './gantt-math';

export interface UnscheduledTrayProps {
  features: Feature[];
  /** Called when a chip is dropped on the gantt plot. endDate defaults to startDate + 14 days. */
  onSchedule: (feature: Feature, startDate: string, endDate: string) => void;
  /** Lets the parent show a drop highlight on the plot while a chip is dragged. */
  onDragChange?: (dragging: boolean) => void;
}

const DEFAULT_SPAN_DAYS = 14;

export function UnscheduledTray({ features, onSchedule, onDragChange }: UnscheduledTrayProps) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-medium text-foreground">Unscheduled</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Drag a feature onto the timeline to schedule it.
      </p>
      {features.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Everything is scheduled — nice work.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {features.map((f) => (
            <TrayChip key={f.id} feature={f} onSchedule={onSchedule} onDragChange={onDragChange} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrayChip({
  feature,
  onSchedule,
  onDragChange,
}: {
  feature: Feature;
  onSchedule: UnscheduledTrayProps['onSchedule'];
  onDragChange?: (dragging: boolean) => void;
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);

  function handleDown(e: React.PointerEvent) {
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* jsdom has no pointer capture */
    }
    originRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ dx: 0, dy: 0 });
    onDragChange?.(true);
  }

  function handleMove(e: React.PointerEvent) {
    if (!originRef.current) return;
    setDrag({ dx: e.clientX - originRef.current.x, dy: e.clientY - originRef.current.y });
  }

  function handleUp(e: React.PointerEvent) {
    if (!originRef.current) return;
    originRef.current = null;
    setDrag(null);
    onDragChange?.(false);

    const plot = document.querySelector<SVGSVGElement>('[data-gantt-plot]');
    if (!plot) return;
    const rect = plot.getBoundingClientRect();
    const within =
      e.clientX >= rect.left + GUTTER_WIDTH &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;
    const viewStart = plot.getAttribute('data-view-start');
    if (!within || !viewStart) return;

    const startDate = xToDate(e.clientX - rect.left - GUTTER_WIDTH, viewStart, PX_PER_DAY);
    const endDate = format(addDays(parseISO(startDate), DEFAULT_SPAN_DAYS), 'yyyy-MM-dd');
    onSchedule(feature, startDate, endDate);
  }

  return (
    <button
      type="button"
      data-testid={`gantt-tray-chip-${feature.id}`}
      className={`inline-flex touch-none select-none items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm transition-colors duration-150 ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
        drag ? 'cursor-grabbing opacity-50' : 'cursor-grab'
      }`}
      style={drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px)`, zIndex: 50, position: 'relative' } : undefined}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={() => {
        originRef.current = null;
        setDrag(null);
        onDragChange?.(false);
      }}
      aria-label={`Schedule ${feature.title}`}
    >
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: HORIZON_COLORS[feature.horizon].bar }}
      />
      {feature.title}
    </button>
  );
}
