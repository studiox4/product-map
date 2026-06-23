import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from './useEntrance';

const BARS = [
  { x: 18, y: 22, w: 66, fill: '#4338CA' },
  { x: 34, y: 44, w: 48, fill: '#6D63F0' },
  { x: 18, y: 66, w: 38, fill: '#4338CA' },
  { x: 44, y: 88, w: 52, fill: '#6D63F0' },
] as const;

/**
 * Hero centerpiece. Same four-rect Stagger geometry as BrandMark, scaled up.
 * SSR ships the bars fully visible (no hidden initial until mount); on mount the
 * bars stagger/draw in via scaleX from the left, then breathe. Reduced motion →
 * static bars.
 */
export function HeroGraphic({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label="Animated ProductMap roadmap bars"
    >
      {BARS.map((b, i) => (
        <m.rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={14}
          rx={7}
          fill={b.fill}
          style={{ transformOrigin: `${b.x}px ${b.y + 7}px` }}
          initial={animate ? { scaleX: 0, opacity: 0 } : false}
          animate={
            animate
              ? { scaleX: 1, opacity: 1, y: [0, -1.5, 0] }
              : undefined
          }
          transition={{
            scaleX: { duration: 0.5, delay: 0.12 * i, ease: [0.22, 1, 0.36, 1] },
            opacity: { duration: 0.3, delay: 0.12 * i },
            y: { duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: 0.6 },
          }}
        />
      ))}
    </svg>
  );
}
