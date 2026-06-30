import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from '../useEntrance';

const PROJECTS = ['Mobile app', 'Billing platform', 'Design system'] as const;

/**
 * Decorative mock of the project switcher: a dropdown whose rows fade in and the
 * active row highlights. Play-once on viewport entry; SSR ships the final state.
 */
export function SwitcherMock({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  return (
    <div
      className={className}
      role="img"
      aria-label="Switching between projects in one workspace"
    >
      <div className="rounded-lg border border-border bg-background p-2 shadow-sm">
        {PROJECTS.map((name, i) => (
          <m.div
            key={name}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
              i === 0 ? 'bg-action-soft text-ink' : 'text-muted-foreground'
            }`}
            initial={animate ? { opacity: 0, x: -8 } : false}
            whileInView={animate ? { opacity: 1, x: 0 } : undefined}
            viewport={{ once: true, margin: '0px 0px -15% 0px' }}
            transition={{ duration: 0.4, delay: 0.1 * i, ease: [0.22, 1, 0.36, 1] }}
          >
            <span
              className={`h-2 w-2 rounded-full ${i === 0 ? 'bg-action' : 'bg-border'}`}
              aria-hidden
            />
            <span className="truncate">{name}</span>
            {i === 0 ? <span className="ml-auto text-action">✓</span> : null}
          </m.div>
        ))}
      </div>
    </div>
  );
}
