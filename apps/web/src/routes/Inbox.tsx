import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lightbulb, Plus } from 'lucide-react';
import type { IdeaStatus } from '@productmap/shared';
import { useIdeas } from '@/lib/api';
import { IdeaVotePills } from '@/components/inbox/IdeaVotePills';
import { IdeaByline, IdeaDetailPane } from '@/components/inbox/IdeaDetailPane';
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
                  <div className="mt-1.5">
                    <IdeaByline idea={idea} />
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
            <IdeaDetailPane
              key={selected.id}
              idea={selected}
              onPromote={() => setPromoteOpen(true)}
            />
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
