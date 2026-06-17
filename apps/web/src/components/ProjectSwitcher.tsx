import { Link } from 'react-router-dom';
import { Check, ChevronDown, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useActiveProject } from '@/lib/project';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';

/**
 * Nav project switcher. Trigger shows the active project's name; the menu lists
 * the caller's projects (switching the active one on click) plus a "New
 * project…" affordance. Renders nothing when the caller has no projects — the
 * first-run gate (AuthedShell) handles that case.
 */
export function ProjectSwitcher() {
  const { projectId, projects, setProjectId } = useActiveProject();

  if (projects.length === 0) return null;

  const active = projects.find((p) => p.id === projectId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Switch project"
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-body-ink outline-none transition-all duration-150 ease-out hover:bg-surface/60 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="max-w-40 truncate">{active?.name ?? 'Select project'}</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={() => setProjectId(p.id)}
            className="cursor-pointer"
          >
            <Check
              className={cn('h-3.5 w-3.5', p.id === projectId ? 'opacity-100' : 'opacity-0')}
              aria-hidden
            />
            <span className="truncate">{p.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link to={`${appRoutes.dashboard}?new=1`}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New project…
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ProjectSwitcher;
