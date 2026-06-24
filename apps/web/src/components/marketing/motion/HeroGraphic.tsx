import { useRef } from 'react';
import { m, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';
import { useEntrance } from './useEntrance';
import { STAGGER_INK, STAGGER_LIT, PLAYHEAD } from './palette';

/**
 * Hero centerpiece — a cinematic, layered gantt rather than a flat logo.
 *
 * Depth: each bar is a translucent gradient slab with a soft drop shadow, the
 * back rows sitting lower-opacity so the stack reads 3-dimensional. Life: a slow
 * specular sheen sweeps across the bars, faint particles drift up the timeline,
 * and the whole composition tilts toward the cursor (parallax) so it feels like
 * a live surface, not a picture.
 *
 * SSR-safe: bars + gridlines render fully visible with no hidden initial (tilt is
 * identity, sheen/particles are absent) until mount. Reduced motion → a static,
 * still-premium layered frame (no tilt, sheen, particles, or float).
 */

const BARS = [
  { x: 18, y: 24, w: 64, depth: 0, fill: STAGGER_INK },
  { x: 34, y: 46, w: 46, depth: 1, fill: STAGGER_LIT },
  { x: 18, y: 68, w: 36, depth: 2, fill: STAGGER_INK },
  { x: 44, y: 90, w: 50, depth: 1, fill: STAGGER_LIT },
] as const;

const GRID_X = [36, 54, 72] as const;
const GRID_Y1 = 18;
const GRID_Y2 = 110;

// Drift particles along the timeline (positions are static; motion is per-particle).
const PARTICLES = [
  { x: 28, delay: 0, dur: 7 },
  { x: 50, delay: 1.6, dur: 8.5 },
  { x: 68, delay: 3.1, dur: 6.5 },
  { x: 84, delay: 4.4, dur: 9 },
] as const;

export function HeroGraphic({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  // Cursor parallax tilt — pointer position (-0.5..0.5) → small spring-damped rotation.
  const wrapRef = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [8, -8]), { stiffness: 120, damping: 18 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [-6, 6]), { stiffness: 120, damping: 18 });

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!animate) return;
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  }
  function onLeave() {
    px.set(0);
    py.set(0);
  }

  return (
    <div
      ref={wrapRef}
      className={className}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ perspective: 900 }}
    >
      <m.svg
        viewBox="0 0 120 128"
        role="img"
        aria-label="An animated product roadmap"
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d', width: '100%', height: 'auto' }}
      >
        <defs>
          {/* Per-stream vertical gradient for glassy depth */}
          <linearGradient id="hg-ink" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={STAGGER_LIT} />
            <stop offset="1" stopColor={STAGGER_INK} />
          </linearGradient>
          <linearGradient id="hg-lit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8B83F5" />
            <stop offset="1" stopColor={STAGGER_LIT} />
          </linearGradient>
          {/* Soft drop shadow for lift */}
          <filter id="hg-shadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="2.4" stdDeviation="2.6" floodColor={STAGGER_INK} floodOpacity="0.28" />
          </filter>
          {/* Specular sheen gradient, animated via gradientTransform */}
          <linearGradient id="hg-sheen" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
            {animate && (
              <animateTransform
                attributeName="gradientTransform"
                type="translate"
                from="-1 0"
                to="1 0"
                dur="3.6s"
                begin="0.4s"
                repeatCount="indefinite"
              />
            )}
          </linearGradient>
          <clipPath id="hg-bars-clip">
            {BARS.map((b, i) => (
              <rect key={i} x={b.x} y={b.y} width={b.w} height={15} rx={7.5} />
            ))}
          </clipPath>
        </defs>

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

        {/* Layered translucent roadmap bars with depth + soft shadow */}
        <g filter="url(#hg-shadow)">
          {BARS.map((b, i) => (
            <m.rect
              data-bar
              key={i}
              x={b.x}
              y={b.y}
              width={b.w}
              height={15}
              rx={7.5}
              fill={b.fill === STAGGER_INK ? 'url(#hg-ink)' : 'url(#hg-lit)'}
              opacity={1 - b.depth * 0.12}
              style={{ transformOrigin: `${b.x}px ${b.y + 7.5}px` }}
              initial={animate ? { scaleX: 0, opacity: 0 } : false}
              animate={animate ? { scaleX: 1, opacity: 1 - b.depth * 0.12, y: [0, -1.6, 0] } : undefined}
              transition={{
                scaleX: { duration: 0.55, delay: 0.1 * i, ease: [0.22, 1, 0.36, 1] },
                opacity: { duration: 0.35, delay: 0.1 * i },
                y: { duration: 4.5 + i, repeat: Infinity, ease: 'easeInOut', delay: 0.7 + i * 0.3 },
              }}
            />
          ))}
        </g>

        {/* Specular sheen — sweeps across the bars only (clipped) */}
        {animate && (
          <rect
            x={14}
            y={20}
            width={92}
            height={88}
            fill="url(#hg-sheen)"
            clipPath="url(#hg-bars-clip)"
            pointerEvents="none"
          />
        )}

        {/* Ambient particles drifting up the timeline */}
        {animate &&
          PARTICLES.map((p, i) => (
            <m.circle
              key={i}
              cx={p.x}
              r={1.1}
              fill={PLAYHEAD}
              initial={{ cy: GRID_Y2, opacity: 0 }}
              animate={{ cy: GRID_Y1, opacity: [0, 0.7, 0] }}
              transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'linear' }}
            />
          ))}
      </m.svg>
    </div>
  );
}
