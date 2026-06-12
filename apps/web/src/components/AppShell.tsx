import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Lightbulb, Map, Search, Settings } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import ThemeToggle from '@/components/ThemeToggle';
import WelcomeDialog from '@/components/WelcomeDialog';
import CommandPalette from '@/components/command/CommandPalette';
import ShortcutsOverlay from '@/components/command/ShortcutsOverlay';
import { useGlobalShortcuts } from '@/components/command/useGlobalShortcuts';
import { useTrackRecents } from '@/components/command/recents';
import { cn } from '@/lib/utils';

const NAV_LINKS: { to: string; label: string; end: boolean; icon?: typeof Lightbulb }[] = [
  { to: '/', label: 'Overview', end: true },
  { to: '/inbox', label: 'Inbox', end: false, icon: Lightbulb },
  { to: '/board', label: 'Board', end: false },
  { to: '/docs', label: 'Docs', end: true },
  { to: '/roadmap', label: 'Roadmap', end: false },
  { to: '/releases', label: 'Releases', end: false },
  { to: '/outcomes', label: 'Outcomes', end: false },
];

const isMac =
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useGlobalShortcuts({
    onTogglePalette: () => setPaletteOpen((o) => !o),
    onToggleShortcuts: () => setShortcutsOpen((o) => !o),
  });
  useTrackRecents();

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
                    'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'bg-surface text-ink shadow-card'
                      : 'text-body-ink hover:bg-surface/60 hover:text-ink',
                  )
                }
              >
                {link.icon ? <link.icon className="h-3.5 w-3.5" aria-hidden /> : null}
                {link.label}
              </NavLink>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted-ink outline-none transition-colors duration-150 ease-out hover:bg-surface/60 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open command palette"
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted-ink shadow-sm-card sm:inline">
                {isMac ? '⌘K' : 'Ctrl K'}
              </kbd>
            </button>
            <ThemeToggle />
            <NavLink
              to="/settings"
              aria-label="Settings"
              title="Settings"
              className={({ isActive }) =>
                cn(
                  'flex h-8 w-8 items-center justify-center rounded-full outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'bg-surface text-ink shadow-card'
                    : 'text-body-ink hover:bg-surface/60 hover:text-ink',
                )
              }
            >
              <Settings className="h-4 w-4" aria-hidden />
            </NavLink>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-screen-xl px-6 py-8">
        <Outlet />
      </main>
      <Toaster position="bottom-right" />
      <WelcomeDialog />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

export default AppShell;
