// Dependency arrows on the gantt: bezier from blocker bar end → blocked bar
// start, muted action color with an arrowhead (Dream Tier D4). Always on.
import type { Feature } from '@productmap/shared';
import { BAR_HEIGHT, HEADER_HEIGHT, type Rect, barRect } from './gantt-math';

/** One blocker→blocked edge of the workspace dependency graph. */
export interface DependencyEdge {
  blockerId: string;
  blockedId: string;
}

/** Minimum bezier handle length (px) so short hops still curve visibly. */
export const ARROW_MIN_HANDLE = 24;

/**
 * Cubic bezier from (x1,y1) → (x2,y2) with horizontal tangents at both ends.
 * Handle length is half the horizontal distance, clamped to ARROW_MIN_HANDLE,
 * so backward edges bow outward instead of folding back through the bars.
 */
export function dependencyArrowPath(x1: number, y1: number, x2: number, y2: number): string {
  const handle = Math.max(Math.abs(x2 - x1) / 2, ARROW_MIN_HANDLE);
  return `M ${x1} ${y1} C ${x1 + handle} ${y1}, ${x2 - handle} ${y2}, ${x2} ${y2}`;
}

export interface DependencyArrowsProps {
  /** Dated features in row order (same array the chart maps over). */
  features: Feature[];
  edges: DependencyEdge[];
  viewStart: string;
  pxPerDay: number;
}

/** Renders inside the plot <g> (already translated past the gutter). */
export function DependencyArrows({ features, edges, viewStart, pxPerDay }: DependencyArrowsProps) {
  const rects = new Map<string, Rect>();
  features.forEach((f, i) => {
    const rect = barRect(f, viewStart, pxPerDay, i);
    if (rect) rects.set(f.id, { ...rect, y: rect.y + HEADER_HEIGHT });
  });

  const drawable = edges.filter((e) => rects.has(e.blockerId) && rects.has(e.blockedId));
  if (drawable.length === 0) return null;

  return (
    <g data-testid="gantt-dependency-arrows" pointerEvents="none">
      <defs>
        <marker
          id="pm-dep-arrowhead"
          viewBox="0 0 8 8"
          refX={7}
          refY={4}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--pm-action)" fillOpacity={0.55} />
        </marker>
      </defs>
      {drawable.map((e) => {
        const from = rects.get(e.blockerId)!;
        const to = rects.get(e.blockedId)!;
        return (
          <path
            key={`${e.blockerId}-${e.blockedId}`}
            data-testid={`gantt-dep-${e.blockerId}-${e.blockedId}`}
            d={dependencyArrowPath(
              from.x + from.width,
              from.y + BAR_HEIGHT / 2,
              to.x - 2,
              to.y + BAR_HEIGHT / 2,
            )}
            fill="none"
            stroke="var(--pm-action)"
            strokeOpacity={0.45}
            strokeWidth={1.5}
            markerEnd="url(#pm-dep-arrowhead)"
          />
        );
      })}
    </g>
  );
}
