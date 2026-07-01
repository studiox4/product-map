import { toast } from 'sonner';
import { RELEASE_STATUSES, type Release, type ReleaseStatus } from '@productmap/shared';
import { useUpdateRelease } from '@/lib/api';
import { confettiBurst } from '@/lib/delight';
import { cn, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@productmap/ui';

const STATUS_LABELS: Record<ReleaseStatus, string> = {
  planned: 'Planned',
  shipped: 'Shipped',
};

/**
 * Status select pill (dream tier 2 §7) — replaces the ship-only button.
 * Transitions go BOTH ways; confetti fires ONLY on planned→shipped.
 */
export function ReleaseStatusSelect({
  release,
}: {
  release: Pick<Release, 'id' | 'name' | 'status'>;
}) {
  const updateRelease = useUpdateRelease();

  const change = (next: string) => {
    const status = next as ReleaseStatus;
    if (status === release.status || updateRelease.isPending) return;
    const shipping = release.status === 'planned' && status === 'shipped';
    updateRelease.mutate(
      { id: release.id, status },
      {
        onSuccess: () => {
          if (shipping) {
            confettiBurst();
            toast.success(`Shipped ${release.name} 🎉`);
          } else {
            toast.success(`Moved ${release.name} back to planned`);
          }
        },
        onError: () => toast.error(`Couldn't update '${release.name}'`),
      },
    );
  };

  return (
    <Select value={release.status} onValueChange={change}>
      <SelectTrigger
        aria-label={`Status for ${release.name}`}
        className={cn(
          'h-7 w-auto gap-1 rounded-full border-transparent px-3 py-0 text-xs font-medium shadow-none transition-colors duration-150 ease-out',
          release.status === 'shipped'
            ? 'bg-sage-soft text-sage'
            : 'bg-action-soft text-action',
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RELEASE_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default ReleaseStatusSelect;
