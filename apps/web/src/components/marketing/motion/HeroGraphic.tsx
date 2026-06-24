import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from './useEntrance';
import { STAGGER_INK, STAGGER_LIT, PLAYHEAD } from './palette';

const BARS = [
  { x: 18, y: 22, w: 66, fill: STAGGER_INK },
  { x: 34, y: 44, w: 48, fill: STAGGER_LIT },
  { x: 18, y: 66, w: 38, fill: STAGGER_INK },
  { x: 44, y: 88, w: 52, fill: STAGGER_LIT },
] as const;

// Three evenly-spaced vertical gridlines within the chart area (x 18–84, y 18–102)
const GRID_X = [36, 54, 72] as const;
const GRID_Y1 = 18;
const GRID_Y2 = 102;

/**
 * Hero centerpiece. Same four-rect Stagger geometry as BrandMark, scaled up.
 * SSR ships the bars + gridlines fully visible (no hidden initial until mount).
 * On mount bars stagger/draw in via scaleX then breathe; a playhead sweeps
 * left→right suggesting a moving "today" marker. Reduced motion → static frame.
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
      {/* Faint vertical gridlines — static, SSR-visible */}
      {GRID_X.map((gx) => (
        <line
          key={gx}
          data-grid
          x1={gx}
          y1={GRID_Y1}
          x2={gx}
          y2={GRID_Y2}
          stroke="currentColor"
          strokeOpacity={0.08}
          strokeWidth={0.75}
        />
      ))}

      {/* Roadmap bars */}
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

      {/* Playhead sweep — only rendered after mount (not during SSR), hidden under reduced motion */}
      {animate && (
        <m.line
          data-playhead
          x1={18}
          y1={GRID_Y1}
          x2={18}
          y2={GRID_Y2}
          stroke={PLAYHEAD}
          strokeOpacity={0.6}
          strokeWidth={1}
          initial={{ x: 0 }}
          animate={{ x: 66 }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'linear', repeatDelay: 0.5 }}
        />
      )}
    </svg>
  );
}
