import { Link } from 'react-router-dom';
import type { MyWorkItem } from '@productmap/shared';
import { appRoutes } from '@/lib/routes';
import { cn } from '@productmap/ui/lib/utils';

const STATUS_DOT: Record<string, string> = {
  idea: 'bg-muted-ink/50',
  planned: 'bg-action/60',
  in_progress: 'bg-amber-500',
  shipped: 'bg-emerald-500',
};

export default function MyWork({ items }: { items: MyWorkItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="my-work-heading" className="space-y-3">
      <h2 id="my-work-heading" className="font-display text-lg font-semibold text-ink">
        My work
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-card">
        {items.map((w) => (
          <li key={w.featureId}>
            <Link
              to={appRoutes.feature(w.featureId)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink outline-none transition-colors hover:bg-bg focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[w.status] ?? 'bg-muted-ink/50')} aria-hidden />
              <span className="flex-1 truncate">{w.title}</span>
              <span className="shrink-0 text-xs capitalize text-muted-ink">{w.status.replace('_', ' ')}</span>
              <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-xs text-muted-ink">{w.projectSlug}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
