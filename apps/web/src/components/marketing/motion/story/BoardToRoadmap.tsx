// apps/web/src/components/marketing/motion/story/BoardToRoadmap.tsx
import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from '../useEntrance';

const ROWS = [
  { y: 20, fromX: 8, toX: 52, w: 56, fill: '#4338CA' },
  { y: 44, fromX: 8, toX: 68, w: 40, fill: '#6D63F0' },
  { y: 68, fromX: 8, toX: 44, w: 64, fill: '#4338CA' },
] as const;

/**
 * Story graphic: three "cards" on the left slide right and snap into gantt bars,
 * illustrating board → roadmap. SSR ships bars in their final (roadmap) position;
 * animation only runs client-side after mount, on viewport entry.
 */
export function BoardToRoadmap({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  return (
    <svg viewBox="0 0 140 96" className={className} role="img" aria-label="Board turning into a roadmap">
      {/* timeline gridlines */}
      <line x1="48" y1="6" x2="48" y2="90" stroke="currentColor" strokeOpacity="0.12" />
      <line x1="92" y1="6" x2="92" y2="90" stroke="currentColor" strokeOpacity="0.12" />
      {ROWS.map((r, i) => (
        <m.rect
          key={i}
          data-bar
          y={r.y}
          height={14}
          width={r.w}
          rx={7}
          fill={r.fill}
          initial={animate ? { x: r.fromX, opacity: 0.6 } : false}
          whileInView={animate ? { x: r.toX, opacity: 1 } : undefined}
          viewport={{ once: true, margin: '0px 0px -15% 0px' }}
          x={animate ? undefined : r.toX}
          transition={{ duration: 0.55, delay: 0.12 * i, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </svg>
  );
}
