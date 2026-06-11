import { Link, NavLink, Outlet } from 'react-router-dom';
import { Map } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import ThemeToggle from '@/components/ThemeToggle';
import WelcomeDialog from '@/components/WelcomeDialog';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/board', label: 'Board', end: false },
  { to: '/docs', label: 'Docs', end: true },
  { to: '/roadmap', label: 'Roadmap', end: false },
];

export function AppShell() {
  return (
    <div className="min-h-screen text-foreground">
      <header className="bg-transparent">
        <nav className="mx-auto flex h-16 max-w-screen-xl items-center gap-6 px-6">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-full font-display text-lg font-bold tracking-tight text-ink outline-none transition-opacity duration-150 ease-out hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Map className="h-4 w-4 text-action" aria-hidden />
            ProductMap
          </Link>
          <div className="flex items-center gap-1.5">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-4 py-1.5 text-sm font-medium outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'bg-surface text-ink shadow-card'
                      : 'text-body-ink hover:bg-surface/60 hover:text-ink',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-screen-xl px-6 py-8">
        <Outlet />
      </main>
      <Toaster position="bottom-right" />
      <WelcomeDialog />
    </div>
  );
}

export default AppShell;
