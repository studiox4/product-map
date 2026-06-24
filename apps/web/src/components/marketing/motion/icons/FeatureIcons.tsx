import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from '../useEntrance';

type IconProps = { className?: string };

function useIconAnimate() {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  return entered && !reduce;
}

const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, fill: 'none' };

/** Roadmap & horizons — three stagger bars drawing in. */
export function RoadmapIcon({ className }: IconProps) {
  const animate = useIconAnimate();
  const bars = [
    { y: 5, x: 3, w: 14 },
    { y: 11, x: 7, w: 12 },
    { y: 17, x: 3, w: 9 },
  ];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {bars.map((b, i) => (
        <m.rect
          key={i} x={b.x} y={b.y} width={b.w} height={3} rx={1.5} fill="currentColor"
          style={{ transformOrigin: `${b.x}px ${b.y + 1.5}px` }}
          initial={animate ? { scaleX: 0 } : false}
          whileInView={animate ? { scaleX: 1 } : undefined}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 * i, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </svg>
  );
}

/** Feature hub + docs — a page with lines. */
export function DocsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="5" y="3" width="14" height="18" rx="2" {...stroke} />
      <line x1="8" y1="8" x2="16" y2="8" {...stroke} />
      <line x1="8" y1="12" x2="16" y2="12" {...stroke} />
      <line x1="8" y1="16" x2="13" y2="16" {...stroke} />
    </svg>
  );
}

/** Releases — a tag/ship glyph that nudges on hover (handled by parent group-hover). */
export function ReleasesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M4 4 L13 4 L20 11 L13 18 L4 18 Z" {...stroke} />
      <circle cx="8.5" cy="11" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** AI copilot — pulsing spark (same language as CopilotPulse). */
export function CopilotIcon({ className }: IconProps) {
  const animate = useIconAnimate();
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <m.path
        d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z"
        fill="currentColor"
        style={{ transformOrigin: '12px 12px' }}
        initial={animate ? { scale: 0.85, opacity: 0.7 } : false}
        animate={animate ? { scale: [0.95, 1.05, 0.95], opacity: [0.85, 1, 0.85] } : undefined}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  );
}
