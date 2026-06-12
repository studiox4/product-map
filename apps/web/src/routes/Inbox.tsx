import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ArrowUpRight, Archive, Lightbulb, Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { IdeaStatus, IdeaWithVotes } from '@productmap/shared';
import { useIdeas, useUpdateIdea } from '@/lib/api';
import { IdeaVotePills } from '@/components/inbox/IdeaVotePills';
import { NewIdeaDialog } from '@/components/inbox/NewIdeaDialog';
import { PromoteIdeaDialog } from '@/components/inbox/PromoteIdeaDialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const FILTERS: { value: IdeaStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'triaged', label: 'Triaged' },
  { value: 'promoted', label: 'Promoted' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_LABELS: Record<IdeaStatus, string> = {
  inbox: 'Inbox',
  triaged: 'Triaged',
  promoted: 'Promoted',
  archived: 'Archived',
};

const STATUS_BADGE: Record<IdeaStatus, string> = {
  inbox: 'bg-inset text-muted-ink',
  triaged: 'bg-action-soft text-action',
  promoted: 'bg-sage-soft text-sage',
  archived: 'bg-inset text-muted-ink line-through',
};

const proseClass =
  'space-y-3 text-sm leading-6 text-body-ink ' +
  '[&_h1]:font-display [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-ink ' +
  '[&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink ' +
  '[&_h3]:font-display [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-ink ' +
  '[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 ' +
  '[&_a]:text-action [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-line-dash [&_blockquote]:pl-3 ' +
  '[&_code]:rounded [&_code]:bg-inset [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs';

function StatusBadgeChip({ status }: { status: IdeaStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_BADGE[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Idea Inbox (Dream tier D1): two-column capture/triage surface. */
export default function Inbox() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<IdeaStatus | undefined>(undefined);
  const { data: ideas, isLoading, isError, refetch } = useIdeas(filter);
  const updateIdea = useUpdateIdea();
  const [newOpen, setNewOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);

  // ⌘K "New idea…" deep link: /inbox?new=1 opens the capture dialog once.
  useEffect(() => {
    if (searchParams.get('new')) {
      setNewOpen(true);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('new');
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  const selectedId = searchParams.get('idea');
  const selected = useMemo(() => {
    if (!ideas?.length) return null;
    return ideas.find((i) => i.id === selectedId) ?? ideas[0];
  }, [ideas, selectedId]);

  const selectIdea = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('idea', id);
      return next;
    });
  };

  const setStatus = (idea: IdeaWithVotes, status: IdeaStatus, errorLabel: string) => {
    updateIdea.mutate(
      { id: idea.id, status },
      { onError: () => toast.error(`Couldn't ${errorLabel} '${idea.title}'`) },
    );
  };

  const bodyHtml = useMemo(
    () =>
      selected?.bodyMd
        ? DOMPurify.sanitize(marked.parse(selected.bodyMd, { async: false }) as string)
        : '',
    [selected?.bodyMd],
  );

  if (isError) {
    return (
      <div className="rounded-2xl bg-panel p-10 text-center">
        <p className="text-sm text-body-ink">Couldn't load the idea inbox.</p>
        <Button variant="outline" className="mt-4 rounded-full" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            Idea Inbox
          </h1>
          <p className="mt-1 text-sm text-muted-ink">
            Capture everything; promote what earns a spot on the board.
          </p>
        </div>
        <Button className="rounded-full" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New idea
        </Button>
      </div>

      <div className="flex items-center gap-1.5" role="group" aria-label="Filter by status">
        {FILTERS.map(({ value, label }) => (
          <button
            key={label}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring',
              filter === value
                ? 'bg-surface text-ink shadow-card'
                : 'text-body-ink hover:bg-surface/60 hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div data-testid="inbox-skeleton" className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr,3fr]">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : !ideas?.length ? (
        <div className="rounded-2xl border border-dashed border-line-dash p-12 text-center">
          <Lightbulb className="mx-auto h-8 w-8 text-muted-ink" aria-hidden />
          <p className="mt-3 text-sm text-body-ink">
            {filter
              ? `No ${STATUS_LABELS[filter].toLowerCase()} ideas.`
              : 'No ideas yet — capture your first one.'}
          </p>
          {!filter ? (
            <Button className="mt-4 rounded-full" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Capture your first idea
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr,3fr]">
          {/* Left: idea list */}
          <ul className="space-y-2" aria-label="Ideas">
            {ideas.map((idea) => (
              <li key={idea.id}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-current={selected?.id === idea.id || undefined}
                  onClick={() => selectIdea(idea.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectIdea(idea.id);
                    }
                  }}
                  className={cn(
                    'w-full cursor-pointer rounded-2xl p-4 text-left outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring',
                    selected?.id === idea.id
                      ? 'bg-surface shadow-card'
                      : 'bg-panel hover:bg-surface/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-ink">{idea.title}</p>
                    {idea.status !== 'inbox' ? <StatusBadgeChip status={idea.status} /> : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <IdeaVotePills idea={idea} size="compact" />
                    {idea.source ? (
                      <span className="truncate text-xs text-muted-ink">{idea.source}</span>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Right: detail pane */}
          {selected ? (
            <section className="self-start rounded-2xl bg-panel p-6" aria-label="Idea detail">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">
                    {selected.title}
                  </h2>
                  {selected.source ? (
                    <p className="mt-1 text-xs text-muted-ink">Source: {selected.source}</p>
                  ) : null}
                </div>
                <StatusBadgeChip status={selected.status} />
              </div>

              <div className="mt-4">
                <IdeaVotePills idea={selected} size="full" />
              </div>

              <div className="mt-5">
                {selected.bodyMd ? (
                  // eslint-disable-next-line react/no-danger -- sanitized via DOMPurify above
                  <div className={proseClass} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                ) : (
                  <p className="text-sm text-muted-ink">No details yet.</p>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                {selected.status === 'promoted' && selected.promotedFeatureId ? (
                  <Button asChild variant="outline" className="rounded-full">
                    <Link to={`/features/${selected.promotedFeatureId}`}>
                      <ArrowUpRight className="h-4 w-4" aria-hidden />
                      View feature
                    </Link>
                  </Button>
                ) : null}
                {selected.status === 'inbox' || selected.status === 'triaged' ? (
                  <>
                    <Button className="rounded-full" onClick={() => setPromoteOpen(true)}>
                      <ArrowUpRight className="h-4 w-4" aria-hidden />
                      Promote to feature
                    </Button>
                    {selected.status === 'inbox' ? (
                      <Button
                        variant="outline"
                        className="rounded-full"
                        onClick={() => setStatus(selected, 'triaged', 'triage')}
                      >
                        Mark triaged
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      className="rounded-full"
                      onClick={() => setStatus(selected, 'archived', 'archive')}
                    >
                      <Archive className="h-4 w-4" aria-hidden />
                      Archive
                    </Button>
                  </>
                ) : null}
                {selected.status === 'archived' ? (
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setStatus(selected, 'inbox', 'restore')}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Restore to inbox
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <NewIdeaDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(idea) => selectIdea(idea.id)}
      />
      {selected ? (
        <PromoteIdeaDialog
          key={selected.id}
          idea={selected}
          open={promoteOpen}
          onOpenChange={setPromoteOpen}
        />
      ) : null}
    </div>
  );
}
