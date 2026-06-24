import { useRef } from 'react';
import { m, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';
import { useEntrance } from './useEntrance';
import { STAGGER_INK, STAGGER_LIT, PLAYHEAD, INK_BASE, TEAL, AMBER, SAGE, PANEL_TINT } from './palette';

/**
 * Hero illustration — a flat, dimensional "roadmap workspace": a floating glass
 * gantt panel with a real timeline (month axis, swimlanes with labels + assignee
 * dots), solid task bars, a milestone diamond, finish-to-start dependency
 * connectors, a "Today" playhead, a branching what-if scenario draft, and an
 * elevated task card popping off the surface for collage depth. Indigo-dominant
 * with restrained teal/amber accents.
 *
 * The dependency connectors are derived from bar geometry — each links a
 * predecessor's right edge to a successor's left edge (which always starts
 * after the predecessor ends) with a right-angle elbow and arrowhead, the way a
 * real gantt draws them.
 *
 * SSR-safe: every element renders at its final, visible state with no hidden
 * initial until mount. Reduced motion → a complete static frame.
 */

const BAR_H = 14;
const HALF = BAR_H / 2;

// Swimlane task bars. Successors (targets of a dependency) start after their
// predecessor ends, so finish-to-start links connect cleanly.
const ROWS = [
  { y: 104, x: 150, w: 112, fill: STAGGER_INK, dot: STAGGER_LIT, label: 56 }, // 0  end 262
  { y: 140, x: 150, w: 74, fill: STAGGER_LIT, dot: TEAL, label: 64 }, //        1  end 224
  { y: 176, x: 278, w: 84, fill: TEAL, dot: SAGE, label: 48 }, //               2  start 278  <- dep 0→2
  { y: 212, x: 176, w: 96, fill: STAGGER_INK, dot: AMBER, label: 60 }, //       3  end 272
  { y: 248, x: 300, w: 90, fill: AMBER, dot: STAGGER_LIT, label: 52 }, //       4  start 300  <- dep 3→4
  { y: 284, x: 206, w: 104, fill: STAGGER_LIT, dot: TEAL, label: 44 }, //       5  end 310
] as const;

// Finish-to-start dependencies [predecessorIndex, successorIndex].
const DEPS = [
  [0, 2],
  [3, 4],
] as const;

const GRID_X = [150, 210, 270, 330, 390] as const;
const MONTHS = ['JUN', 'JUL', 'AUG', 'SEP', 'OCT'] as const;
const GRID_Y1 = 92;
const GRID_Y2 = 312;
const PLAYHEAD_X = 270;

// Right-angle finish-to-start connector: predecessor right edge → elbow →
// successor left edge.
function connectorPath(p: (typeof ROWS)[number], s: (typeof ROWS)[number]) {
  const ex = p.x + p.w;
  const ey = p.y + HALF;
  const sx = s.x;
  const sy = s.y + HALF;
  const midX = ex + Math.min(14, Math.max(8, (sx - ex) / 2));
  return `M${ex} ${ey} H${midX} V${sy} H${sx}`;
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

  // Scenario "what-if" draft branches off the end of row 3.
  const forkRow = ROWS[3];
  const forkEx = forkRow.x + forkRow.w;
  const forkEy = forkRow.y + HALF;
  const ghost = { x: forkEx + 18, y: 232, w: 92 };

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
          <linearGradient id="hg-panel" x1="0" y1="0" x2="0.2" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor={PANEL_TINT} />
          </linearGradient>
          <radialGradient id="hg-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={STAGGER_LIT} stopOpacity="0.12" />
            <stop offset="1" stopColor={STAGGER_LIT} stopOpacity="0" />
          </radialGradient>
          <filter id="hg-panelShadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="8" stdDeviation="9" floodColor={INK_BASE} floodOpacity="0.12" />
          </filter>
          <filter id="hg-cardShadow" x="-40%" y="-40%" width="180%" height="200%">
            <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor={INK_BASE} floodOpacity="0.16" />
          </filter>
          <marker id="hg-arrow" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
            <path d="M0 0 L5 3 L0 6 z" fill="#A8AEC6" />
          </marker>
          <clipPath id="hg-panelClip">
            <rect x={40} y={56} width={384} height={296} rx={20} />
          </clipPath>
        </defs>

        {/* Single faint ambient bloom */}
        <ellipse cx={230} cy={150} rx={170} ry={130} fill="url(#hg-glow)" />

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

          {/* Swimlane left labels (avatar + text lines) */}
          {ROWS.map((r) => (
            <g key={`lab-${r.y}`}>
              <circle cx={62} cy={r.y + HALF} r={6} fill={r.dot} />
              <rect x={74} y={r.y + 1} width={r.label} height={5} rx={2.5} fill="#C4CADB" />
              <rect x={74} y={r.y + 10} width={r.label - 18} height={4} rx={2} fill="#DCE0EC" />
            </g>
          ))}

          {/* Finish-to-start dependency connectors (under the bars) */}
          {DEPS.map(([p, s], i) => (
            <path
              key={`dep-${i}`}
              d={connectorPath(ROWS[p], ROWS[s])}
              fill="none"
              stroke="#A8AEC6"
              strokeWidth={1.4}
              strokeLinejoin="round"
              markerEnd="url(#hg-arrow)"
            />
          ))}

          {/* Task bars — flat solid fills */}
          {ROWS.map((r, i) => (
            <m.g
              key={`bar-${r.y}`}
              style={{ transformOrigin: `${r.x}px ${r.y + HALF}px` }}
              initial={animate ? { scaleX: 0, opacity: 0 } : false}
              animate={animate ? { scaleX: 1, opacity: 1 } : undefined}
              transition={{ duration: 0.55, delay: 0.12 + 0.09 * i, ease: [0.22, 1, 0.36, 1] }}
            >
              <rect data-bar x={r.x} y={r.y} width={r.w} height={BAR_H} rx={HALF} fill={r.fill} />
              <circle cx={r.x + r.w - 8} cy={r.y + HALF} r={3} fill="#fff" />
              <circle cx={r.x + r.w - 8} cy={r.y + HALF} r={1.7} fill={r.dot} />
            </m.g>
          ))}

          {/* Scenario "what-if" draft — dashed branch off row 3's end into a ghost bar */}
          <m.g
            initial={animate ? { x: -18, opacity: 0 } : false}
            animate={animate ? { x: 0, opacity: 1 } : undefined}
            transition={{ duration: 0.7, delay: 1.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <path
              d={`M${forkEx} ${forkEy} H${forkEx + 9} V${ghost.y + HALF} H${ghost.x}`}
              fill="none"
              stroke={PLAYHEAD}
              strokeWidth={1.2}
              strokeDasharray="3 2"
              strokeLinejoin="round"
              opacity={0.85}
            />
            <rect
              x={ghost.x}
              y={ghost.y}
              width={ghost.w}
              height={BAR_H}
              rx={HALF}
              fill={PLAYHEAD}
              fillOpacity={0.13}
              stroke={PLAYHEAD}
              strokeOpacity={0.7}
              strokeWidth={1}
              strokeDasharray="4 2.5"
            />
          </m.g>

          {/* Milestone diamonds at task finishes */}
          <rect
            x={ROWS[2].x + ROWS[2].w - 4}
            y={ROWS[2].y + HALF - 4.5}
            width={9}
            height={9}
            rx={1.5}
            transform={`rotate(45 ${ROWS[2].x + ROWS[2].w + 0.5} ${ROWS[2].y + HALF})`}
            fill={AMBER}
          />
          <rect
            x={ROWS[5].x + ROWS[5].w - 4}
            y={ROWS[5].y + HALF - 4.5}
            width={9}
            height={9}
            rx={1.5}
            transform={`rotate(45 ${ROWS[5].x + ROWS[5].w + 0.5} ${ROWS[5].y + HALF})`}
            fill={SAGE}
          />
        </g>

        {/* "Today" playhead — above the panel clip so the flag sits proud */}
        <line x1={PLAYHEAD_X} y1={92} x2={PLAYHEAD_X} y2={344} stroke={STAGGER_INK} strokeOpacity={0.5} strokeWidth={1.4} />
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
          <rect x={18} y={250} width={150} height={104} rx={14} fill="#FFFFFF" stroke="#ECECF6" strokeWidth={1} />
          <circle cx={38} cy={272} r={8} fill={STAGGER_LIT} />
          <text x={38} y={275.5} fontSize={8} fontWeight={700} fill="#fff" textAnchor="middle">
            ◆
          </text>
          <rect x={52} y={266} width={70} height={6} rx={3} fill="#C4CADB" />
          <rect x={52} y={277} width={48} height={5} rx={2.5} fill="#DCE0EC" />
          <rect x={30} y={296} width={34} height={12} rx={6} fill={STAGGER_INK} opacity={0.12} />
          <text x={47} y={305} fontSize={7} fontWeight={700} fill={STAGGER_INK} textAnchor="middle" opacity={0.8}>
            PRD
          </text>
          <rect x={70} y={296} width={42} height={12} rx={6} fill={SAGE} opacity={0.16} />
          <text x={91} y={305} fontSize={7} fontWeight={700} fill={SAGE} textAnchor="middle">
            On track
          </text>
          <rect x={30} y={322} width={108} height={6} rx={3} fill="#E4E8F3" />
          <rect x={30} y={322} width={72} height={6} rx={3} fill={STAGGER_LIT} />
          <rect x={30} y={336} width={60} height={5} rx={2.5} fill="#DCE0EC" />
          <path d="M150 274 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill={STAGGER_LIT} opacity={0.9} />
        </m.g>
      </m.svg>
    </div>
  );
}
