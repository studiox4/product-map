import { Link } from 'react-router-dom';
import { Star, ArrowUpRight } from 'lucide-react';
import type { DashboardProject } from '@productmap/shared';
import { appRoutes } from '@/lib/routes';
import { useToggleFavorite } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS_META: { key: keyof DashboardProject['counts']; label: string; dot: string }[] = [
  { key: 'idea', label: 'Ideas', dot: 'bg-muted-ink/50' },
  { key: 'planned', label: 'Planned', dot: 'bg-action/60' },
  { key: 'in_progress', label: 'In progress', dot: 'bg-amber-500' },
  { key: 'shipped', label: 'Shipped', dot: 'bg-emerald-500' },
];

function ProjectCard({ project }: { project: DashboardProject }) {
  const toggle = useToggleFavorite();
  const total = STATUS_META.reduce((n, s) => n + project.counts[s.key], 0);

  return (
    <div className="group relative flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={appRoutes.projectOverview(project.slug)}
          className="flex items-center gap-1 font-display text-base font-semibold text-ink outline-none hover:text-action focus-visible:ring-2 focus-visible:ring-ring"
        >
          {project.name}
          <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
        </Link>
        <button
          type="button"
          aria-label={project.favorite ? 'Unfavorite project' : 'Favorite project'}
          aria-pressed={project.favorite}
          onClick={() => toggle.mutate({ projectId: project.id, favorite: !project.favorite })}
          className="rounded-full p-1 text-muted-ink outline-none transition-colors hover:text-amber-500 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star className={cn('h-4 w-4', project.favorite && 'fill-amber-400 text-amber-500')} aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-ink">
        <span className="rounded-full bg-bg px-2 py-0.5 capitalize">{project.role}</span>
        {project.staleCount > 0 && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {project.staleCount} overdue
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className="text-xs text-muted-ink">No features yet.</p>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-ink">
          {STATUS_META.filter((s) => project.counts[s.key] > 0).map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', s.dot)} aria-hidden />
              {project.counts[s.key]} {s.label.toLowerCase()}
            </span>
          ))}
        </div>
      )}

      {project.nextRelease && (
        <p className="text-xs text-muted-ink">
          Next release: <span className="font-medium text-ink">{project.nextRelease.name}</span>
          {project.nextRelease.date ? ` · ${project.nextRelease.date}` : ''}
        </p>
      )}
    </div>
  );
}

export default function MyProjects({ projects }: { projects: DashboardProject[] }) {
  return (
    <section aria-labelledby="my-projects-heading" className="space-y-3">
      <h2 id="my-projects-heading" className="font-display text-lg font-semibold text-ink">
        Your projects
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </section>
  );
}
