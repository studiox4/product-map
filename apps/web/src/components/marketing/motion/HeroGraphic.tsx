import { useRef } from 'react';
import { m, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';
import { useEntrance } from './useEntrance';
import {
  STAGGER_INK,
  STAGGER_LIT,
  PLAYHEAD,
  INK_TOP,
  INK_BASE,
  LIT_TOP,
  LIT_BASE,
  TEAL,
  TEAL_TOP,
  AMBER,
  AMBER_TOP,
  SAGE,
  PANEL_TINT,
} from './palette';

/**
 * Hero illustration — a dimensional "roadmap workspace": a floating glass gantt
 * panel with a real timeline (month axis, swimlanes with labels + assignee dots),
 * gradient task bars, a milestone diamond, dependency connectors, a "Today"
 * playhead, a branching what-if scenario draft, and an elevated task card popping
 * off the surface for collage depth. Indigo-dominant with restrained teal/amber
 * accents.
 *
 * Motion (restrained): the panel and cards settle in, bars draw across the
 * timeline, the playhead's dot pulses, a slow specular glint crosses the glass,
 * the scenario ghost branches, and the whole scene tilts gently toward the cursor.
 *
 * SSR-safe: every element renders at its final, visible state with no hidden
 * initial (tilt identity, glint absent) until mount. Reduced motion → a complete
 * static frame.
 */

// Swimlane task bars. x/w are on the timeline; `grad` selects a gradient.
const ROWS = [
  { y: 104, x: 150, w: 122, grad: 'ink', dot: STAGGER_LIT, label: 56 },
  { y: 140, x: 182, w: 92, grad: 'lit', dot: TEAL, label: 64 },
  { y: 176, x: 150, w: 70, grad: 'teal', dot: SAGE, label: 48 },
  { y: 212, x: 204, w: 108, grad: 'ink', dot: AMBER, label: 60 },
  { y: 248, x: 162, w: 84, grad: 'amber', dot: STAGGER_LIT, label: 52 },
  { y: 284, x: 232, w: 96, grad: 'lit', dot: TEAL, label: 44 },
] as const;

const GRID_X = [150, 210, 270, 330, 390] as const;
const MONTHS = ['JUN', 'JUL', 'AUG', 'SEP', 'OCT'] as const;
const GRID_Y1 = 92;
const GRID_Y2 = 312;
const PLAYHEAD_X = 270;

function gradId(g: string) {
  return `url(#hg-${g})`;
}

export function HeroGraphic({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  // Gentle cursor parallax tilt.
  const wrapRef = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [6, -6]), { stiffness: 80, damping: 20 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [-4, 4]), { stiffness: 80, damping: 20 });

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!animate) return;
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  }
  const onLeave = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <div
      ref={wrapRef}
      className={className}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ perspective: 1100 }}
    >
      <m.svg
        viewBox="0 0 460 380"
        role="img"
        aria-label="An illustrated product roadmap with a what-if scenario draft"
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d', width: '100%', height: 'auto' }}
      >
        <defs>
          <linearGradient id="hg-ink" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={INK_TOP} />
            <stop offset="0.5" stopColor={STAGGER_INK} />
            <stop offset="1" stopColor={INK_BASE} />
          </linearGradient>
          <linearGradient id="hg-lit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={LIT_TOP} />
            <stop offset="0.5" stopColor={STAGGER_LIT} />
            <stop offset="1" stopColor={LIT_BASE} />
          </linearGradient>
          <linearGradient id="hg-teal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={TEAL_TOP} />
            <stop offset="1" stopColor={TEAL} />
          </linearGradient>
          <linearGradient id="hg-amber" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={AMBER_TOP} />
            <stop offset="1" stopColor={AMBER} />
          </linearGradient>
          <linearGradient id="hg-panel" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor={PANEL_TINT} />
          </linearGradient>
          <linearGradient id="hg-card" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#F4F1FD" />
          </linearGradient>
          <radialGradient id="hg-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={STAGGER_LIT} stopOpacity="0.28" />
            <stop offset="1" stopColor={STAGGER_LIT} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hg-glow2" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={TEAL} stopOpacity="0.16" />
            <stop offset="1" stopColor={TEAL} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hg-glint" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
            {animate && (
              <animateTransform
                attributeName="gradientTransform"
                type="translate"
                from="-1 0"
                to="1 0"
                dur="5.5s"
                begin="0.8s"
                repeatCount="indefinite"
              />
            )}
          </linearGradient>
          <filter id="hg-panelShadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="14" stdDeviation="16" floodColor={INK_BASE} floodOpacity="0.18" />
          </filter>
          <filter id="hg-cardShadow" x="-40%" y="-40%" width="180%" height="200%">
            <feDropShadow dx="0" dy="10" stdDeviation="11" floodColor={INK_BASE} floodOpacity="0.22" />
          </filter>
          <filter id="hg-barShadow" x="-20%" y="-40%" width="140%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor={INK_BASE} floodOpacity="0.18" />
          </filter>
          <clipPath id="hg-panelClip">
            <rect x={40} y={56} width={384} height={296} rx={20} />
          </clipPath>
        </defs>

        {/* Ambient blooms behind the panel */}
        <ellipse cx={150} cy={120} rx={150} ry={120} fill="url(#hg-glow)" />
        <ellipse cx={380} cy={300} rx={130} ry={110} fill="url(#hg-glow2)" />

        {/* ===== Main glass gantt panel ===== */}
        <g filter="url(#hg-panelShadow)">
          <rect x={40} y={56} width={384} height={296} rx={20} fill="url(#hg-panel)" stroke="#fff" strokeWidth={1} />
        </g>

        <g clipPath="url(#hg-panelClip)">
          {/* Header */}
          <rect x={40} y={56} width={384} height={36} fill="#FFFFFF" />
          <circle cx={58} cy={74} r={3.4} fill="#E2719B" />
          <circle cx={70} cy={74} r={3.4} fill="#E7B86A" />
          <circle cx={82} cy={74} r={3.4} fill="#7FC79A" />
          <rect x={98} y={70} width={70} height={7} rx={3.5} fill="#D9DEEC" />
          <rect x={364} y={68} width={44} height={11} rx={5.5} fill={PLAYHEAD} opacity={0.16} />
          <rect x={370} y={71} width={32} height={5} rx={2.5} fill={STAGGER_INK} opacity={0.5} />
          <line x1={40} y1={92} x2={424} y2={92} stroke="#E4E8F3" strokeWidth={1} />

          {/* Left label column divider */}
          <line x1={144} y1={92} x2={144} y2={352} stroke="#EAEDF5" strokeWidth={1} />

          {/* Month axis gridlines + labels */}
          {GRID_X.map((gx, i) => (
            <g key={gx}>
              <line data-grid x1={gx} y1={GRID_Y1} x2={gx} y2={GRID_Y2} stroke="#E9ECF5" strokeWidth={1} />
              <text x={gx} y={86} fontSize={8} fontWeight={600} letterSpacing={1} fill="#A9B0C4" textAnchor="middle">
                {MONTHS[i]}
              </text>
            </g>
          ))}

          {/* Swimlane left labels (chip + avatar + text lines) */}
          {ROWS.map((r) => (
            <g key={`lab-${r.y}`}>
              <circle cx={62} cy={r.y + 7} r={6} fill={r.dot} />
              <rect x={74} y={r.y + 1} width={r.label} height={5} rx={2.5} fill="#C4CADB" />
              <rect x={74} y={r.y + 10} width={r.label - 18} height={4} rx={2} fill="#DCE0EC" />
            </g>
          ))}

          {/* Dependency connectors (drawn under bars) */}
          <path
            d="M272 115 C 292 115, 292 151, 308 151"
            fill="none"
            stroke="#B9C0D6"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <path
            d="M274 187 C 296 187, 300 223, 312 223"
            fill="none"
            stroke="#B9C0D6"
            strokeWidth={1.4}
            strokeLinecap="round"
          />

          {/* Task bars */}
          <g filter="url(#hg-barShadow)">
            {ROWS.map((r, i) => (
              <m.g
                key={`bar-${r.y}`}
                style={{ transformOrigin: `${r.x}px ${r.y + 7}px` }}
                initial={animate ? { scaleX: 0, opacity: 0 } : false}
                animate={animate ? { scaleX: 1, opacity: 1 } : undefined}
                transition={{ duration: 0.55, delay: 0.12 + 0.09 * i, ease: [0.22, 1, 0.36, 1] }}
              >
                <rect data-bar x={r.x} y={r.y} width={r.w} height={14} rx={7} fill={gradId(r.grad)} />
                {/* top-edge highlight */}
                <rect x={r.x + 3} y={r.y + 1.5} width={r.w - 6} height={1.6} rx={0.8} fill="#fff" opacity={0.35} />
                {/* assignee dot on the bar */}
                <circle cx={r.x + r.w - 8} cy={r.y + 7} r={3.4} fill="#fff" opacity={0.9} />
                <circle cx={r.x + r.w - 8} cy={r.y + 7} r={2} fill={r.dot} />
              </m.g>
            ))}
          </g>

          {/* Scenario "what-if" ghost branching off row 4 */}
          <m.g
            initial={animate ? { x: -22, opacity: 0 } : false}
            animate={animate ? { x: 0, opacity: 1 } : undefined}
            transition={{ duration: 0.7, delay: 1.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <path
              d={`M${PLAYHEAD_X} 219 C ${PLAYHEAD_X + 14} 219, ${PLAYHEAD_X + 14} 240, ${PLAYHEAD_X + 30} 240`}
              fill="none"
              stroke={PLAYHEAD}
              strokeWidth={1.2}
              strokeDasharray="3 2"
              opacity={0.8}
            />
            <rect
              x={PLAYHEAD_X + 30}
              y={233}
              width={86}
              height={14}
              rx={7}
              fill={PLAYHEAD}
              fillOpacity={0.14}
              stroke={PLAYHEAD}
              strokeOpacity={0.7}
              strokeWidth={1}
              strokeDasharray="4 2.5"
            />
          </m.g>

          {/* Milestone diamonds */}
          <g>
            <rect x={387} y={101} width={9} height={9} rx={1.5} transform="rotate(45 391.5 105.5)" fill={AMBER} />
            <rect x={326} y={245} width={9} height={9} rx={1.5} transform="rotate(45 330.5 249.5)" fill={SAGE} />
          </g>

          {/* Specular glint sweep across the panel */}
          {animate && (
            <rect x={40} y={56} width={384} height={296} fill="url(#hg-glint)" pointerEvents="none" />
          )}
        </g>

        {/* "Today" playhead — above the panel clip so the flag sits proud */}
        <line x1={PLAYHEAD_X} y1={92} x2={PLAYHEAD_X} y2={344} stroke={STAGGER_INK} strokeOpacity={0.55} strokeWidth={1.4} />
        <rect x={PLAYHEAD_X - 22} y={44} width={44} height={16} rx={8} fill={STAGGER_INK} />
        <text x={PLAYHEAD_X} y={55} fontSize={8} fontWeight={700} letterSpacing={0.5} fill="#fff" textAnchor="middle">
          TODAY
        </text>
        {animate ? (
          <m.circle
            cx={PLAYHEAD_X}
            cy={344}
            r={4}
            fill={STAGGER_INK}
            animate={{ scale: [1, 1.5, 1], opacity: [0.9, 0.4, 0.9] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: `${PLAYHEAD_X}px 344px` }}
          />
        ) : (
          <circle cx={PLAYHEAD_X} cy={344} r={4} fill={STAGGER_INK} />
        )}

        {/* ===== Elevated floating task card (collage depth, bottom-left) ===== */}
        <m.g
          filter="url(#hg-cardShadow)"
          initial={animate ? { y: 14, opacity: 0 } : false}
          animate={animate ? { y: [0, -4, 0], opacity: 1 } : undefined}
          transition={
            animate
              ? {
                  opacity: { duration: 0.5, delay: 0.5 },
                  y: { duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.5 },
                }
              : undefined
          }
        >
          <rect x={18} y={250} width={150} height={104} rx={14} fill="url(#hg-card)" stroke="#fff" strokeWidth={1} />
          {/* card header: avatar + title */}
          <circle cx={38} cy={272} r={8} fill={STAGGER_LIT} />
          <text x={38} y={275.5} fontSize={8} fontWeight={700} fill="#fff" textAnchor="middle">
            ◆
          </text>
          <rect x={52} y={266} width={70} height={6} rx={3} fill="#C4CADB" />
          <rect x={52} y={277} width={48} height={5} rx={2.5} fill="#DCE0EC" />
          {/* tags */}
          <rect x={30} y={296} width={34} height={12} rx={6} fill={STAGGER_INK} opacity={0.12} />
          <text x={47} y={305} fontSize={7} fontWeight={700} fill={STAGGER_INK} textAnchor="middle" opacity={0.8}>
            PRD
          </text>
          <rect x={70} y={296} width={42} height={12} rx={6} fill={SAGE} opacity={0.16} />
          <text x={91} y={305} fontSize={7} fontWeight={700} fill={SAGE} textAnchor="middle">
            On track
          </text>
          {/* progress */}
          <rect x={30} y={322} width={108} height={6} rx={3} fill="#E4E8F3" />
          <rect x={30} y={322} width={72} height={6} rx={3} fill={STAGGER_LIT} />
          <rect x={30} y={336} width={60} height={5} rx={2.5} fill="#DCE0EC" />
          {/* AI sparkle nod */}
          <path
            d="M150 274 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z"
            fill={STAGGER_LIT}
            opacity={0.9}
          />
        </m.g>
      </m.svg>
    </div>
  );
}
