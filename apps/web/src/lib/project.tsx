import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from './api';
import type { MemberRole, Project } from '@productmap/shared';

export interface ProjectListItem extends Project { role: MemberRole; }

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchJson<ProjectListItem[]>('/api/projects'),
    staleTime: 60_000,
  });
}

const ACTIVE_PROJECT_KEY = 'pm.activeProjectId';

export interface ActiveProjectValue {
  projectId: string | null;
  role: MemberRole | null;
  projects: ProjectListItem[];
  setProjectId(id: string): void;
  isLoading: boolean;
}

const ActiveProjectContext = createContext<ActiveProjectValue | null>(null);

/**
 * Single source of truth for the active project. Sourced from useProjects()
 * (the shared ['projects'] query). Persists the chosen id to localStorage and,
 * on load, prefers the persisted id when it's still in the list — else the
 * first project, else null. Renders children ALWAYS (first-run gating is the
 * AuthedShell's job, not this provider's).
 */
export function ActiveProjectProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useProjects();
  const projects = useMemo(() => data ?? [], [data]);

  // Explicit user choice (setProjectId). Until set, we derive from persistence.
  const [chosenId, setChosenId] = useState<string | null>(null);

  const projectId = useMemo(() => {
    const ids = projects.map((p) => p.id);
    if (chosenId && ids.includes(chosenId)) return chosenId;
    const persisted = localStorage.getItem(ACTIVE_PROJECT_KEY);
    if (persisted && ids.includes(persisted)) return persisted;
    return projects[0]?.id ?? null;
  }, [projects, chosenId]);

  const role = useMemo(
    () => projects.find((p) => p.id === projectId)?.role ?? null,
    [projects, projectId],
  );

  const value = useMemo<ActiveProjectValue>(
    () => ({
      projectId,
      role,
      projects,
      isLoading,
      setProjectId(id: string) {
        localStorage.setItem(ACTIVE_PROJECT_KEY, id);
        setChosenId(id);
      },
    }),
    [projectId, role, projects, isLoading],
  );

  return <ActiveProjectContext.Provider value={value}>{children}</ActiveProjectContext.Provider>;
}

/**
 * Active project + role for role-aware UI and switching. The role is read from
 * the project list (no second fetch). Throws if used outside ActiveProjectProvider.
 */
export function useActiveProject(): ActiveProjectValue {
  const ctx = useContext(ActiveProjectContext);
  if (!ctx) throw new Error('useActiveProject must be used within ActiveProjectProvider');
  return ctx;
}

/** True when the active role can mutate project content (editor or owner). */
export function useCanEdit(): boolean {
  const { role } = useActiveProject();
  return role === 'editor' || role === 'owner';
}

/**
 * Back-compat wrapper for the standalone /docs/:id/read ReaderView mount
 * (rendered outside AuthedShell). Preserves the loading / error / first-run
 * gating, then mounts ActiveProjectProvider so useProjectId() resolves.
 */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useProjects();
  if (isLoading) return null; // AppShell already shows a skeleton wrapper
  if (isError) return <div data-testid="projects-error">Could not load projects.</div>;
  if (!data?.length) return <div data-testid="first-run">Create your first project to get started.</div>;
  return <ActiveProjectProvider>{children}</ActiveProjectProvider>;
}

/** Active project id. Throws if null (programming error — only used in gated areas). */
export function useProjectId(): string {
  const { projectId } = useActiveProject();
  if (!projectId) throw new Error('useProjectId requires an active project');
  return projectId;
}
