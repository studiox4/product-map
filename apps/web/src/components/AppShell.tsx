import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, Lightbulb, Search, Settings, Sparkles } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Toaster } from '@/components/ui/sonner';
import ThemeToggle from '@/components/ThemeToggle';
import { BrandMark } from '@/components/BrandMark';
import CommandPalette from '@/components/command/CommandPalette';
import ShortcutsOverlay from '@/components/command/ShortcutsOverlay';
import CopilotPanel from '@/components/copilot/CopilotPanel';
import ProjectSwitcher from '@/components/ProjectSwitcher';
import { useGlobalShortcuts } from '@/components/command/useGlobalShortcuts';
import { useTrackRecents } from '@/components/command/recents';
import { useAiStatus } from '@/lib/api';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';

const NAV_LINKS: { to: string; label: string; end: boolean; icon?: typeof Lightbulb }[] = [
  { to: appRoutes.dashboard, label: 'Overview', end: true },
  { to: appRoutes.inbox, label: 'Inbox', end: false, icon: Lightbulb },
];

/** Planning surfaces grouped under one "Plan" pill to keep the nav calm. */
const PLAN_LINKS: { to: string; label: string }[] = [
  { to: appRoutes.board, label: 'Board' },
  { to: appRoutes.roadmap, label: 'Roadmap' },
  { to: appRoutes.releases, label: 'Releases' },
  { to: appRoutes.outcomes, label: 'Outcomes' },
];

const DOCS_LINK = { to: appRoutes.docs, label: 'Docs', end: true };

const isMac =
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);

const pillClass = (isActive: boolean) =>
  cn(
    'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring',
    isActive
      ? 'bg-surface text-ink shadow-card'
      : 'text-body-ink hover:bg-surface/60 hover:text-ink',
  );

export function AppShell() {
  const location = useLocation();
  const planActive = PLAN_LINKS.some((l) => location.pathname.startsWith(l.to));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const aiEnabled = useAiStatus().data?.enabled === true;

  useGlobalShortcuts({
    onTogglePalette: () => setPaletteOpen((o) => !o),
    onToggleShortcuts: () => setShortcutsOpen((o) => !o),
    onToggleCopilot: aiEnabled ? () => setCopilotOpen((o) => !o) : undefined,
  });
  useTrackRecents();

  return (
    <div className="min-h-screen text-foreground">
      <header className="bg-transparent">
        <nav className="mx-auto flex h-16 max-w-screen-xl items-center gap-6 px-6">
          <Link
            to={appRoutes.dashboard}
            className="flex items-center gap-2 rounded-full font-display text-lg font-bold tracking-tight text-ink outline-none transition-opacity duration-150 ease-out hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandMark className="h-5 w-5" />
            ProductMap
          </Link>
          <ProjectSwitcher />
          <div className="flex items-center gap-1.5">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => pillClass(isActive)}
              >
                {link.icon ? <link.icon className="h-3.5 w-3.5" aria-hidden /> : null}
                {link.label}
              </NavLink>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger className={pillClass(planActive)}>
                Plan
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-36">
                {PLAN_LINKS.map((link) => (
                  <DropdownMenuItem key={link.to} asChild>
                    <Link
                      to={link.to}
                      className={cn(
                        'cursor-pointer',
                        location.pathname.startsWith(link.to) && 'font-semibold text-ink',
                      )}
                    >
                      {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <NavLink
              to={DOCS_LINK.to}
              end={DOCS_LINK.end}
              className={({ isActive }) => pillClass(isActive)}
            >
              {DOCS_LINK.label}
            </NavLink>
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
            {aiEnabled ? (
              <button
                type="button"
                onClick={() => setCopilotOpen((o) => !o)}
                aria-label="Open copilot"
                title={`Copilot (${isMac ? '⌘J' : 'Ctrl J'})`}
                className="flex h-8 w-8 items-center justify-center rounded-full text-action outline-none transition-all duration-150 ease-out hover:bg-action-soft/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            <ThemeToggle />
            <NavLink
              to={appRoutes.settings}
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
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      {aiEnabled ? (
        <CopilotPanel open={copilotOpen} onOpenChange={setCopilotOpen} />
      ) : null}
    </div>
  );
}

export default AppShell;
