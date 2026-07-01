import { Link } from 'react-router-dom';
import { Search, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { apiErrorMessage, useDashboard, useArchivedProjects, useRestoreProject, usePurgeProject } from '@/lib/api';
import { Skeleton, Button } from '@productmap/ui';
import MyProjects from '@/components/dashboard/MyProjects';
import NextActions from '@/components/dashboard/NextActions';
import MyWork from '@/components/dashboard/MyWork';
import DashboardFeed from '@/components/dashboard/DashboardFeed';
import { toast } from 'sonner';

/** Opens the existing command palette (AppShell listens for ⌘K / Ctrl+K). */
function openCommandPalette() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }));
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8" data-testid="dashboard-skeleton">
      <Skeleton className="h-9 w-56" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-md py-24 text-center" data-testid="dashboard-empty">
      <h1 className="font-display text-2xl font-bold text-ink">Welcome to ProductMap</h1>
      <p className="mt-2 text-sm text-muted-ink">
        You’re not part of any projects yet. Create one to start mapping your roadmap.
      </p>
      <Button asChild className="mt-6">
        <Link to="?new=1">
          <Plus className="h-4 w-4" aria-hidden /> New project
        </Link>
      </Button>
    </div>
  );
}

function ArchivedProjects() {
  const { data: archived } = useArchivedProjects();
  const restore = useRestoreProject();
  const purge = usePurgeProject();

  if (!archived || archived.length === 0) return null;

  function handleRestore(id: string, name: string) {
    restore.mutate(id, {
      onSuccess: () => toast.success(`"${name}" restored`),
      onError: (err) => toast.error(apiErrorMessage(err, 'Could not restore project.')),
    });
  }

  function handlePurge(id: string, name: string) {
    if (!window.confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
    purge.mutate(id, {
      onSuccess: () => toast.success(`"${name}" deleted permanently`),
      onError: (err) => toast.error(apiErrorMessage(err, 'Could not delete project.')),
    });
  }

  return (
    <section aria-labelledby="archived-heading" data-testid="archived-projects">
      <h2 id="archived-heading" className="mb-3 font-display text-lg font-bold text-ink">
        Archived projects
      </h2>
      <ul className="space-y-2">
        {archived.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3"
          >
            <span className="font-medium text-ink">{p.name}</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={restore.isPending}
                onClick={() => handleRestore(p.id, p.name)}
                aria-label={`Restore ${p.name}`}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Restore
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={purge.isPending}
                onClick={() => handlePurge(p.id, p.name)}
                aria-label={`Delete ${p.name} permanently`}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Delete permanently
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Dashboard() {
  const { data, isPending, isError, refetch } = useDashboard();

  if (isPending) return <DashboardSkeleton />;
  if (isError || !data) {
    return (
      <div className="py-24 text-center" data-testid="dashboard-error">
        <p className="text-sm text-muted-ink">Couldn’t load your dashboard.</p>
        <Button variant="outline" className="mt-4" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (data.projects.length === 0) {
    return (
      <>
        <EmptyState />
        <ArchivedProjects />
      </>
    );
  }

  return (
    <div className="space-y-8" data-testid="dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">Dashboard</h1>
        <button
          type="button"
          onClick={openCommandPalette}
          className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm text-muted-ink shadow-card outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          Search everything
        </button>
      </div>

      <NextActions actions={data.nextActions} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <MyProjects projects={data.projects} />
          <MyWork items={data.myWork} />
          <ArchivedProjects />
        </div>
        <DashboardFeed items={data.activity} />
      </div>
    </div>
  );
}
