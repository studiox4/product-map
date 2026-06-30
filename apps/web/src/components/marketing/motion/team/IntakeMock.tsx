import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from '../useEntrance';

/**
 * Decorative mock: a no-login intake form with a submitted idea sliding into an
 * inbox row. Play-once on viewport entry; SSR ships the final state.
 */
export function IntakeMock({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  return (
    <div
      className={className}
      role="img"
      aria-label="A public idea-intake form feeding submissions into an inbox"
    >
      <div className="rounded-lg border border-border bg-background p-2 shadow-sm">
        <div className="space-y-1.5">
          <div className="h-3 w-3/4 rounded bg-muted" />
          <div className="h-3 w-full rounded bg-muted" />
          <span className="inline-block rounded bg-action px-1.5 py-0.5 text-[10px] font-medium text-white">
            Submit idea
          </span>
        </div>
        <m.div
          className="mt-2 flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[10px] text-ink"
          initial={animate ? { opacity: 0, y: 10 } : false}
          whileInView={animate ? { opacity: 1, y: 0 } : undefined}
          viewport={{ once: true, margin: '0px 0px -15% 0px' }}
          transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="h-2 w-2 rounded-full bg-sage" aria-hidden />
          <span className="truncate">New idea → Inbox</span>
          <span className="ml-auto rounded-full bg-inset px-1.5 py-0.5 text-muted-foreground">new</span>
        </m.div>
      </div>
    </div>
  );
}
