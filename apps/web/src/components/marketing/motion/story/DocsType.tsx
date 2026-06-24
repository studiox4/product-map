// apps/web/src/components/marketing/motion/story/DocsType.tsx
import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from '../useEntrance';

const LINES = [
  { y: 14, full: 84 },
  { y: 28, full: 64 },
  { y: 42, full: 78 },
  { y: 56, full: 48 },
] as const;

/** A PRD/markdown block whose lines "type in" (width grows) on viewport entry. */
export function DocsType({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  return (
    <svg viewBox="0 0 110 72" className={className} role="img" aria-label="Markdown doc being written">
      <rect x="6" y="4" width="98" height="64" rx="6" fill="currentColor" fillOpacity="0.04" />
      {LINES.map((l, i) => (
        <m.rect
          key={i}
          data-line
          x={14}
          y={l.y}
          height={6}
          rx={3}
          fill="currentColor"
          fillOpacity={0.35}
          width={animate ? undefined : l.full}
          initial={animate ? { width: 0 } : false}
          whileInView={animate ? { width: l.full } : undefined}
          viewport={{ once: true, margin: '0px 0px -15% 0px' }}
          transition={{ duration: 0.4, delay: 0.15 * i, ease: 'easeOut' }}
        />
      ))}
    </svg>
  );
}
