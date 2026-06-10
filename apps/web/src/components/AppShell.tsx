import { Link, NavLink, Outlet } from 'react-router-dom';
import { Map } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/board', label: 'Board', end: false },
  { to: '/roadmap', label: 'Roadmap', end: false },
];

export function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <nav className="mx-auto flex h-14 max-w-screen-xl items-center gap-6 px-6">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md text-base font-semibold tracking-tight outline-none transition-colors hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Map className="h-4 w-4 text-green-600" aria-hidden />
            ProductMap
          </Link>
          <div className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1 text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
                    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-screen-xl px-6 py-8">
        <Outlet />
      </main>
      <Toaster position="bottom-right" />
    </div>
  );
}

export default AppShell;
