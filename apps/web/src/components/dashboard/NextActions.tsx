import { Link } from 'react-router-dom';
import { MessageSquare, FileText, CalendarClock, CheckCircle2 } from 'lucide-react';
import type { NextAction } from '@productmap/shared';
import { appRoutes } from '@/lib/routes';

function describe(a: NextAction): { icon: typeof MessageSquare; to: string; text: string } {
  switch (a.kind) {
    case 'open_comment':
      return {
        icon: MessageSquare,
        to: a.featureId ? appRoutes.feature(a.featureId) : appRoutes.doc(a.documentId!),
        text: `${a.count} open comment${a.count === 1 ? '' : 's'} on “${a.title}”`,
      };
    case 'doc_in_review':
      return { icon: FileText, to: appRoutes.doc(a.documentId), text: `Review “${a.title}”` };
    case 'feature_missing_dates':
      return { icon: CalendarClock, to: appRoutes.feature(a.featureId), text: `Add dates to “${a.title}”` };
  }
}

export default function NextActions({ actions }: { actions: NextAction[] }) {
  return (
    <section aria-labelledby="next-actions-heading" className="space-y-3">
      <h2 id="next-actions-heading" className="font-display text-lg font-semibold text-ink">
        Next actions
      </h2>
      {actions.length === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl bg-surface p-4 text-sm text-muted-ink shadow-card">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
          You’re all caught up — nothing needs your attention right now.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-card">
          {actions.map((a, i) => {
            const { icon: Icon, to, text } = describe(a);
            return (
              <li key={`${a.kind}-${a.projectSlug}-${i}`}>
                <Link
                  to={to}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink outline-none transition-colors hover:bg-bg focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-ink" aria-hidden />
                  <span className="flex-1 truncate">{text}</span>
                  <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-xs text-muted-ink">
                    {a.projectSlug}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
