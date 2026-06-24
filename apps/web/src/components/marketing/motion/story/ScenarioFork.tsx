import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from '../useEntrance';
import { STAGGER_INK, STAGGER_LIT, PLAYHEAD } from '../palette';

/**
 * Scenario-planning story SVG: a committed roadmap (solid bars) that forks at a
 * decision point into a translucent "what-if" draft (dashed ghost bars shifted
 * to an alternate plan). On scroll the ghosts branch out from the fork line and
 * settle — visualizing exploring an alternate plan without moving the live one.
 *
 * SSR-safe: solid bars + ghosts render at their FINAL positions, visible, with
 * no hidden initial until mount. Reduced motion → static final frame.
 */

// Committed plan — solid bars at their real positions.
const COMMITTED = [
  { y: 12, x: 10, w: 40, fill: STAGGER_INK },
  { y: 30, x: 10, w: 26, fill: STAGGER_LIT },
  { y: 48, x: 10, w: 34, fill: STAGGER_INK },
] as const;

// Fork line x — where the "what-if" branches off.
const FORK_X = 62;

// What-if draft — ghost bars that slide from the fork to an alternate schedule.
const GHOSTS = [
  { y: 12, fromX: FORK_X, toX: 78, w: 30 },
  { y: 30, fromX: FORK_X, toX: 70, w: 44 },
  { y: 48, fromX: FORK_X, toX: 86, w: 24 },
] as const;

export function ScenarioFork({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  return (
    <svg viewBox="0 0 130 72" className={className} role="img" aria-label="Roadmap forking into a what-if scenario">
      {/* fork marker line */}
      <line x1={FORK_X} y1={4} x2={FORK_X} y2={68} stroke="currentColor" strokeOpacity={0.18} strokeWidth={0.75} strokeDasharray="2 2" />

      {/* Committed plan — solid */}
      {COMMITTED.map((b, i) => (
        <rect key={`c${i}`} data-bar x={b.x} y={b.y} width={b.w} height={11} rx={5.5} fill={b.fill} />
      ))}

      {/* What-if draft — translucent dashed ghosts that branch on reveal */}
      {GHOSTS.map((g, i) => (
        <m.rect
          key={`g${i}`}
          data-ghost
          y={g.y}
          width={g.w}
          height={11}
          rx={5.5}
          fill={PLAYHEAD}
          fillOpacity={0.16}
          stroke={PLAYHEAD}
          strokeOpacity={0.6}
          strokeWidth={0.75}
          strokeDasharray="3 2"
          x={animate ? undefined : g.toX}
          initial={animate ? { x: g.fromX, opacity: 0 } : false}
          whileInView={animate ? { x: g.toX, opacity: 1 } : undefined}
          viewport={{ once: true, margin: '0px 0px -15% 0px' }}
          transition={{ duration: 0.6, delay: 0.12 * i + 0.2, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </svg>
  );
}
