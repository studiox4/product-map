import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FeatureWithDocs, User } from '@productmap/shared';
import { fetchJson, queryKeys, useCollaborators, useUsers } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';

function useFeatureCollaborators(featureId: string) {
  return useQuery({
    // Prefixed by queryKeys.feature(featureId) so feature invalidations refresh this too.
    queryKey: [...queryKeys.feature(featureId), 'collaborators'],
    queryFn: () => fetchJson<User[]>(`/api/features/${featureId}/collaborators`),
    enabled: !!featureId,
  });
}

/** Right-rail people card: creator, collaborators, add/remove popover. */
export function PeopleRail({ feature }: { feature: FeatureWithDocs }) {
  const { data: users } = useUsers();
  const collaboratorsQuery = useFeatureCollaborators(feature.id);
  const setCollaborators = useCollaborators();
  const [addOpen, setAddOpen] = useState(false);

  const collaborators = collaboratorsQuery.data ?? [];
  const creator = users?.find((u) => u.id === feature.createdBy) ?? null;
  const addable = (users ?? []).filter((u) => !collaborators.some((c) => c.id === u.id));

  const save = (userIds: string[]) => {
    setCollaborators.mutate(
      { featureId: feature.id, userIds },
      { onError: () => toast.error(`Couldn't update people on '${feature.title}'`) },
    );
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-card" aria-label="People">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-ink">People</h2>
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              disabled={addable.length === 0}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 rounded-xl p-1.5">
            <ul>
              {addable.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      save([...collaborators.map((c) => c.id), u.id]);
                      setAddOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-body-ink transition-colors duration-150 ease-out hover:bg-[#f6f8fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <UserAvatar user={u} size="sm" />
                    <span className="truncate">{u.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>

      <ul className="mt-3 space-y-2">
        {creator ? (
          <li className="flex items-center gap-2 text-sm text-body-ink">
            <UserAvatar user={creator} size="md" />
            <span className="min-w-0 flex-1 truncate">{creator.name}</span>
            <span className="text-xs text-muted-ink">Creator</span>
          </li>
        ) : null}
        {collaboratorsQuery.isLoading ? (
          <li>
            <Skeleton className="h-7 w-full" />
          </li>
        ) : (
          collaborators
            .filter((c) => c.id !== creator?.id)
            .map((c) => (
              <li key={c.id} className="group flex items-center gap-2 text-sm text-body-ink">
                <UserAvatar user={c} size="md" />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => save(collaborators.filter((x) => x.id !== c.id).map((x) => x.id))}
                  className="rounded-full p-1 text-muted-ink transition-colors duration-150 ease-out hover:bg-[#f6f8fb] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))
        )}
      </ul>

      {creator ? (
        <p className="mt-3 border-t border-[#eef1f5] pt-3 text-xs text-muted-ink">
          Added by {creator.name} · {format(parseISO(feature.createdAt), 'MMM d')}
        </p>
      ) : null}
    </section>
  );
}

export default PeopleRail;
