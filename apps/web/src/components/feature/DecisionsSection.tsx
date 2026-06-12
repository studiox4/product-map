import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ChevronDown, ChevronRight, Gavel } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Decision } from '@productmap/shared';
import { useDecisions } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';

const proseClass =
  'space-y-2 text-sm leading-6 text-body-ink ' +
  '[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 ' +
  '[&_a]:text-action [&_a]:underline [&_code]:rounded [&_code]:bg-inset [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs';

function Markdown({ md }: { md: string }) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(md, { async: false }) as string),
    [md],
  );
  // eslint-disable-next-line react/no-danger -- sanitized via DOMPurify above
  return <div className={proseClass} dangerouslySetInnerHTML={{ __html: html }} />;
}

function DecisionCard({ decision }: { decision: Decision }) {
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const decider =
    decision.decidedByName != null
      ? { name: decision.decidedByName, color: decision.decidedByColor ?? '#6b7280' }
      : null;

  return (
    <li className="rounded-xl bg-surface p-4 shadow-sm-card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium leading-snug text-ink">{decision.title}</h3>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-ink">
          {decider ? <UserAvatar user={decider} size="sm" /> : null}
          <time dateTime={decision.decidedAt}>
            {format(parseISO(decision.decidedAt), 'MMM d, yyyy')}
          </time>
        </div>
      </div>
      <div className="mt-2">
        <Markdown md={decision.decisionMd} />
      </div>
      {decision.alternativesMd ? (
        <div className="mt-3 border-t border-line pt-2">
          <button
            type="button"
            aria-expanded={alternativesOpen}
            onClick={() => setAlternativesOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full text-xs font-medium text-muted-ink transition-colors duration-150 ease-out hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {alternativesOpen ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
            Alternatives considered
          </button>
          {alternativesOpen ? (
            <div className="mt-2">
              <Markdown md={decision.alternativesMd} />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Feature-page Decisions section (D3) — display only. Decisions are created
 * from resolved comment threads ("Log decision" lives in CommentsSection).
 */
export function DecisionsSection({ featureId }: { featureId: string }) {
  const decisionsQuery = useDecisions(featureId);
  const decisions = decisionsQuery.data ?? [];

  return (
    <section className="rounded-2xl bg-panel p-6" aria-label="Decisions">
      <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
        <Gavel className="h-4 w-4 text-muted-ink" aria-hidden />
        Decisions
        {decisions.length > 0 ? (
          <span className="font-sans text-xs font-medium text-muted-ink">{decisions.length}</span>
        ) : null}
      </h2>
      <div className="mt-3">
        {decisionsQuery.isLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : decisions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-dash px-3 py-5 text-center text-sm text-muted-ink">
            No decisions logged yet — resolve a discussion and log what you decided.
          </p>
        ) : (
          <ul className="space-y-2">
            {decisions.map((d) => (
              <DecisionCard key={d.id} decision={d} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default DecisionsSection;
