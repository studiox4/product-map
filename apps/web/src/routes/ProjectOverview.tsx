import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useActiveProject } from '@/lib/project';
import { appRoutes } from '@/lib/routes';
import { Skeleton } from '@productmap/ui';
import Landing from '@/routes/Landing';

/**
 * Slug-addressed single-project overview (`/app/p/:slug`). Resolves the slug
 * against the loaded project list, makes it the active project (so the rest of
 * the context-driven app — board, roadmap — follows), then renders the existing
 * Landing overview. The active-project switch OVERRIDES any persisted choice,
 * so a deep-linked URL always wins.
 */
export default function ProjectOverview() {
  const { slug } = useParams();
  const { projects, isLoading, projectId, setProjectId } = useActiveProject();
  const match = projects.find((p) => p.slug === slug);

  useEffect(() => {
    if (match && match.id !== projectId) setProjectId(match.id);
  }, [match, projectId, setProjectId]);

  // Project list still loading — show a skeleton rather than a premature 404.
  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="overview-loading">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="mx-auto max-w-md py-24 text-center" data-testid="overview-not-found">
        <h1 className="font-display text-2xl font-bold text-ink">Project not found</h1>
        <p className="mt-2 text-sm text-muted-ink">
          No project matches <span className="font-mono">/p/{slug}</span>.
        </p>
        <Link
          to={appRoutes.dashboard}
          className="mt-6 inline-block rounded-full bg-action px-4 py-2 text-sm font-medium text-white"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  // Wait for the active-project switch to land before rendering Landing, so its
  // useProjectId() reads the slug's project, not the previously active one.
  if (projectId !== match.id) return null;

  return <Landing />;
}
