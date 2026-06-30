import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from '../useEntrance';

const SECTIONS = [
  { label: 'Roadmap', on: true },
  { label: 'Board', on: true },
  { label: 'Changelog', on: false },
] as const;

/**
 * Decorative mock: a read-only share link bar, the section toggles, and an
 * expiry pill. Play-once on viewport entry; SSR ships the final state.
 */
export function ShareMock({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  return (
    <div
      className={className}
      role="img"
      aria-label="A public read-only share link with section toggles and an expiry"
    >
      <div className="rounded-lg border border-border bg-background p-2 shadow-sm">
        <m.div
          className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 font-mono text-[10px] text-muted-foreground"
          initial={animate ? { opacity: 0 } : false}
          whileInView={animate ? { opacity: 1 } : undefined}
          viewport={{ once: true, margin: '0px 0px -15% 0px' }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="truncate">/share/r0a4m…</span>
          <span className="ml-auto rounded border border-border px-1.5 py-0.5 text-ink">Copy</span>
        </m.div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {SECTIONS.map((s, i) => (
            <m.span
              key={s.label}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                s.on ? 'bg-action-soft text-action' : 'bg-inset text-muted-foreground line-through'
              }`}
              initial={animate ? { opacity: 0, y: 6 } : false}
              whileInView={animate ? { opacity: 1, y: 0 } : undefined}
              viewport={{ once: true, margin: '0px 0px -15% 0px' }}
              transition={{ duration: 0.3, delay: 0.1 * i, ease: [0.22, 1, 0.36, 1] }}
            >
              {s.label}
            </m.span>
          ))}
          <span className="ml-auto rounded-full bg-warm-soft px-2 py-0.5 text-[10px] font-medium text-warm">
            Expires 30d
          </span>
        </div>
      </div>
    </div>
  );
}
