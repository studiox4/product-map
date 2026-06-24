import { useRef } from 'react';
import { m, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';
import { useEntrance } from './useEntrance';
import { STAGGER_INK, STAGGER_LIT } from './palette';

/**
 * Hero centerpiece — a calm, Apple-grade material study of a roadmap.
 *
 * The four Stagger bars are rendered as lit glass slabs: a multi-stop gradient
 * with a bright top edge, a soft drop shadow for lift, and a slow specular glint
 * that travels across the surface. A single soft glow blooms behind the stack
 * for ambient depth, and the whole composition tilts gently toward the cursor.
 * No floating particles, no clutter — restraint over decoration.
 *
 * SSR-safe: bars, glow, and gridlines render fully visible with no hidden initial
 * (tilt is identity, glint is absent) until mount. Reduced motion → a still,
 * fully-formed frame (no tilt, glint, or float).
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

export function HeroGraphic({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  // Gentle cursor parallax tilt — restrained, spring-damped.
  const wrapRef = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [5, -5]), { stiffness: 90, damping: 20 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [-4, 4]), { stiffness: 90, damping: 20 });

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
      style={{ perspective: 1000 }}
    >
      <m.svg
        viewBox="0 0 120 128"
        role="img"
        aria-label="An animated product roadmap"
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d', width: '100%', height: 'auto' }}
      >
        <defs>
          {/* Lit-glass gradients: bright top edge → saturated body → deeper base */}
          <linearGradient id="hg-ink" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6E63F2" />
            <stop offset="0.45" stopColor={STAGGER_INK} />
            <stop offset="1" stopColor="#372BB0" />
          </linearGradient>
          <linearGradient id="hg-lit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#A39BFA" />
            <stop offset="0.45" stopColor={STAGGER_LIT} />
            <stop offset="1" stopColor="#5246D8" />
          </linearGradient>
          {/* Soft ambient bloom behind the stack */}
          <radialGradient id="hg-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={STAGGER_LIT} stopOpacity="0.22" />
            <stop offset="1" stopColor={STAGGER_LIT} stopOpacity="0" />
          </radialGradient>
          {/* Soft drop shadow for lift */}
          <filter id="hg-shadow" x="-25%" y="-25%" width="150%" height="170%">
            <feDropShadow dx="0" dy="3" stdDeviation="3.2" floodColor={STAGGER_INK} floodOpacity="0.22" />
          </filter>
          {/* Specular glint that travels across the bars (clipped to them) */}
          <linearGradient id="hg-glint" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.4" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
            {animate && (
              <animateTransform
                attributeName="gradientTransform"
                type="translate"
                from="-1 0"
                to="1 0"
                dur="5s"
                begin="0.6s"
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

        {/* Ambient bloom — static, SSR-visible */}
        <ellipse cx={60} cy={66} rx={58} ry={50} fill="url(#hg-glow)" />

        {/* Faint vertical gridlines */}
        {GRID_X.map((gx) => (
          <line
            key={gx}
            data-grid
            x1={gx}
            y1={GRID_Y1}
            x2={gx}
            y2={GRID_Y2}
            stroke="currentColor"
            strokeOpacity={0.07}
            strokeWidth={0.75}
          />
        ))}

        {/* Lit-glass roadmap bars with depth + soft shadow */}
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
              opacity={1 - b.depth * 0.1}
              style={{ transformOrigin: `${b.x}px ${b.y + 7.5}px` }}
              initial={animate ? { scaleX: 0, opacity: 0 } : false}
              animate={animate ? { scaleX: 1, opacity: 1 - b.depth * 0.1, y: [0, -1.4, 0] } : undefined}
              transition={{
                scaleX: { duration: 0.6, delay: 0.1 * i, ease: [0.22, 1, 0.36, 1] },
                opacity: { duration: 0.4, delay: 0.1 * i },
                y: { duration: 5 + i, repeat: Infinity, ease: 'easeInOut', delay: 0.8 + i * 0.35 },
              }}
            />
          ))}
        </g>

        {/* Crisp top-edge highlight for the glass read (subtle, static) */}
        {BARS.map((b, i) => (
          <rect
            key={`hl${i}`}
            x={b.x + 3}
            y={b.y + 1.5}
            width={b.w - 6}
            height={2}
            rx={1}
            fill="#fff"
            opacity={(1 - b.depth * 0.1) * 0.28}
          />
        ))}

        {/* Specular glint sweep — clipped to the bars */}
        {animate && (
          <rect
            x={14}
            y={20}
            width={92}
            height={88}
            fill="url(#hg-glint)"
            clipPath="url(#hg-bars-clip)"
            pointerEvents="none"
          />
        )}
      </m.svg>
    </div>
  );
}
