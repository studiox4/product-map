import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from './api';
import type { Project } from '@productmap/shared';

export interface ProjectListItem extends Project { role: 'owner' | 'editor' | 'viewer'; }

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchJson<ProjectListItem[]>('/api/projects'),
    staleTime: 60_000,
  });
}

const ProjectIdContext = createContext<string | null>(null);

/** Active project = the user's first/sole project (switcher is 2c). First-run UI when none. */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useProjects();
  if (isLoading) return null; // AppShell already shows a skeleton wrapper
  if (isError) return <div data-testid="projects-error">Could not load projects.</div>;
  const active = data?.[0]?.id ?? null;
  if (!active) return <div data-testid="first-run">Create your first project to get started.</div>;
  return <ProjectIdContext.Provider value={active}>{children}</ProjectIdContext.Provider>;
}

/** Active project id. Throws if used outside ProjectProvider (programming error). */
export function useProjectId(): string {
  const id = useContext(ProjectIdContext);
  if (!id) throw new Error('useProjectId must be used within ProjectProvider');
  return id;
}
