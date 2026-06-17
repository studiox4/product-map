import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { FolderKanban, LayoutTemplate, Settings as SettingsIcon, UserRound, Users, Wrench } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { appRoutes } from '@/lib/routes';

const BASE_TABS = [
  { to: appRoutes.settingsTab('templates'), label: 'Templates', icon: LayoutTemplate },
  { to: appRoutes.settingsTab('workspace'), label: 'Workspace', icon: Wrench },
  { to: appRoutes.settingsTab('project'), label: 'Project', icon: FolderKanban },
  { to: appRoutes.settingsTab('profile'), label: 'Profile', icon: UserRound },
];

const ADMIN_TABS = [
  { to: appRoutes.settingsTab('users'), label: 'Users', icon: Users },
];

/**
 * Settings section shell (settings spec): left pill tab rail
 * (Templates / Workspace / Profile [/ Users for admins]), content card to the right.
 * Tab content renders through the nested routes in App.tsx.
 */
export function SettingsPage() {
  const { me } = useAuth();
  const tabs = me?.role === 'admin' ? [...BASE_TABS, ...ADMIN_TABS] : BASE_TABS;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <SettingsIcon className="h-5 w-5 text-action" aria-hidden />
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Settings</h1>
      </header>
      <div className="flex flex-col gap-8 md:flex-row">
        <nav aria-label="Settings sections" className="flex shrink-0 gap-1.5 md:w-44 md:flex-col">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'bg-surface text-ink shadow-card'
                    : 'text-body-ink hover:bg-surface/60 hover:text-ink',
                )
              }
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          <Suspense
            fallback={
              <div className="space-y-6">
                <Skeleton className="h-48 rounded-2xl" />
                <Skeleton className="h-32 rounded-2xl" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
