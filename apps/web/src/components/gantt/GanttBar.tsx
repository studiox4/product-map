import { useRef, useState } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { HORIZON_COLORS, type Feature } from '@productmap/shared';
import {
  CLICK_TOLERANCE_PX,
  MIN_BAR_DAYS,
  type Rect,
  clampDrag,
  shiftDates,
} from './gantt-math';

export interface GanttBarProps {
  feature: Feature;
  rect: Rect;
  pxPerDay: number;
  /** Move → { startDate, endDate }; resize → { endDate } only. */
  onCommit: (feature: Feature, patch: { startDate?: string; endDate?: string }) => void;
  onClick: (feature: Feature) => void;
  highlighted?: boolean;
}

type DragMode = 'move' | 'resize';

export function GanttBar({ feature, rect, pxPerDay, onCommit, onClick, highlighted }: GanttBarProps) {
  const [drag, setDrag] = useState<{ mode: DragMode; originX: number; dx: number } | null>(null);
  const movedRef = useRef(false);

  const durationDays =
    feature.startDate && feature.endDate
      ? differenceInCalendarDays(parseISO(feature.endDate), parseISO(feature.startDate)) + 1
      : MIN_BAR_DAYS;

  const previewDays = drag
    ? clampDrag(
        drag.dx,
        pxPerDay,
        drag.mode === 'resize' ? { minDeltaDays: MIN_BAR_DAYS - durationDays } : {},
      )
    : 0;

  const x = rect.x + (drag?.mode === 'move' ? previewDays * pxPerDay : 0);
  const width = Math.max(
    rect.width + (drag?.mode === 'resize' ? previewDays * pxPerDay : 0),
    MIN_BAR_DAYS * pxPerDay,
  );

  function start(mode: DragMode) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch {
        /* jsdom has no pointer capture */
      }
      movedRef.current = false;
      setDrag({ mode, originX: e.clientX, dx: 0 });
    };
  }

  function handleMove(e: React.PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.originX;
    if (Math.abs(dx) >= CLICK_TOLERANCE_PX) movedRef.current = true;
    setDrag({ ...drag, dx });
  }

  function handleUp(e: React.PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.originX;
    const wasClick = drag.mode === 'move' && !movedRef.current && Math.abs(dx) < CLICK_TOLERANCE_PX;
    setDrag(null);
    if (wasClick) {
      onClick(feature);
      return;
    }
    const days = clampDrag(
      dx,
      pxPerDay,
      drag.mode === 'resize' ? { minDeltaDays: MIN_BAR_DAYS - durationDays } : {},
    );
    if (days === 0 || !feature.startDate || !feature.endDate) return;
    if (drag.mode === 'move') {
      onCommit(feature, shiftDates(feature.startDate, feature.endDate, days));
    } else {
      const { endDate } = shiftDates(feature.endDate, feature.endDate, days);
      onCommit(feature, { endDate });
    }
  }

  const color = HORIZON_COLORS[feature.horizon].bar;

  return (
    <g
      className="group"
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={() => setDrag(null)}
    >
      <rect
        data-testid={`gantt-bar-${feature.id}`}
        data-gantt-bar-id={feature.id}
        x={x}
        y={rect.y}
        width={width}
        height={rect.height}
        rx={rect.height / 2}
        fill={color}
        fillOpacity={drag ? 0.6 : 1}
        stroke={highlighted ? '#2b557e' : 'none'}
        strokeWidth={highlighted ? 2 : 0}
        style={{ filter: 'drop-shadow(0 2px 4px rgba(60,75,95,0.28))' }}
        className={`cursor-grab transition-opacity duration-150 ease-out hover:opacity-90 focus-visible:outline-none ${
          drag?.mode === 'move' ? 'cursor-grabbing' : ''
        } ${highlighted ? 'animate-pulse' : ''}`}
        tabIndex={0}
        role="button"
        aria-label={`${feature.title}, ${feature.startDate} to ${feature.endDate}`}
        onPointerDown={start('move')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onClick(feature);
        }}
      >
        <title>{feature.title}</title>
      </rect>
      {width > 56 && (
        <text
          x={x + 11}
          y={rect.y + rect.height / 2 + 4}
          fontSize={11}
          fontWeight={500}
          fill="#ffffff"
          pointerEvents="none"
        >
          {feature.title.length > Math.floor(width / 8)
            ? `${feature.title.slice(0, Math.max(Math.floor(width / 8) - 1, 1))}…`
            : feature.title}
        </text>
      )}
      {/* Resize grip — visible only while hovering the bar */}
      <rect
        x={x + width - 9}
        y={rect.y + 4}
        width={3}
        height={rect.height - 8}
        rx={1.5}
        fill="#ffffff"
        fillOpacity={0.85}
        pointerEvents="none"
        className="opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100"
      />
      <rect
        data-testid={`gantt-resize-${feature.id}`}
        x={x + width - 8}
        y={rect.y}
        width={8}
        height={rect.height}
        fill="transparent"
        className="cursor-ew-resize"
        onPointerDown={start('resize')}
        aria-label={`Resize ${feature.title}`}
      />
    </g>
  );
}
