import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from '../useEntrance';

const ROLES = [
  { label: 'Owner', cls: 'bg-action-soft text-action' },
  { label: 'Editor', cls: 'bg-sage-soft text-sage' },
  { label: 'Viewer', cls: 'bg-inset text-muted-foreground' },
] as const;

/**
 * Decorative mock: an email-invite line plus the three access-role chips
 * settling in. Play-once on viewport entry; SSR ships the final state.
 */
export function RolesMock({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  return (
    <div
      className={className}
      role="img"
      aria-label="Inviting a teammate by email with owner, editor, or viewer access"
    >
      <div className="rounded-lg border border-border bg-background p-2 shadow-sm">
        <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground">
          <span className="truncate">teammate@company.com</span>
          <span className="ml-auto rounded bg-action px-1.5 py-0.5 text-[10px] font-medium text-white">
            Invite
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ROLES.map((r, i) => (
            <m.span
              key={r.label}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.cls}`}
              initial={animate ? { opacity: 0, y: 6 } : false}
              whileInView={animate ? { opacity: 1, y: 0 } : undefined}
              viewport={{ once: true, margin: '0px 0px -15% 0px' }}
              transition={{ duration: 0.35, delay: 0.12 * i, ease: [0.22, 1, 0.36, 1] }}
            >
              {r.label}
            </m.span>
          ))}
        </div>
      </div>
    </div>
  );
}
