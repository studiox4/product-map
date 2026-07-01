import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, Lightbulb, Menu, Search, Settings, Sparkles } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@productmap/ui';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@productmap/ui';
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
import { useActiveProject } from '@/lib/project';
import { cn } from '@productmap/ui/lib/utils';
import { appRoutes } from '@/lib/routes';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import DemoBanner from '@/demo/DemoBanner';
import { Slot } from '@/lib/slots';

const NAV_LINKS: { to: string; label: string; end: boolean; icon?: typeof Lightbulb }[] = [
  { to: appRoutes.dashboard, label: 'Dashboard', end: true },
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

/** Flat list of every destination, for the mobile drawer (no dropdown nesting). */
const MOBILE_LINKS: { to: string; label: string; end?: boolean }[] = [
  ...NAV_LINKS.map(({ to, label, end }) => ({ to, label, end })),
  ...PLAN_LINKS,
  DOCS_LINK,
  { to: appRoutes.settings, label: 'Settings' },
];

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
  const { projects, projectId } = useActiveProject();
  const activeSlug = projects.find((p) => p.id === projectId)?.slug;
  const planActive = PLAN_LINKS.some((l) => location.pathname.startsWith(l.to));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const aiEnabled = useAiStatus().data?.enabled === true;

  useGlobalShortcuts({
    onTogglePalette: () => setPaletteOpen((o) => !o),
    onToggleShortcuts: () => setShortcutsOpen((o) => !o),
    onToggleCopilot: aiEnabled ? () => setCopilotOpen((o) => !o) : undefined,
  });
  useTrackRecents();

  return (
    <div className="min-h-screen text-foreground">
      <DemoBanner />
      <header className="bg-transparent">
        <nav className="mx-auto flex h-16 max-w-screen-xl items-center gap-3 px-4 md:gap-6 md:px-6">
          {/* Mobile menu (hamburger → left drawer with all destinations) */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger
              aria-label="Open menu"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-body-ink outline-none transition-colors hover:bg-surface/60 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="px-5 pt-5 text-sm font-semibold text-ink">Menu</SheetTitle>
              <div className="border-b border-line px-3 py-3">
                <ProjectSwitcher />
              </div>
              <div className="flex flex-col gap-0.5 p-3">
                {MOBILE_LINKS.map((link) => (
                  <SheetClose asChild key={link.to}>
                    <NavLink
                      to={link.to}
                      end={link.end}
                      className={({ isActive }) =>
                        cn(
                          'rounded-lg px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                          isActive
                            ? 'bg-surface text-ink shadow-sm-card'
                            : 'text-body-ink hover:bg-surface/60 hover:text-ink',
                        )
                      }
                    >
                      {link.label}
                    </NavLink>
                  </SheetClose>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <Link
            to={appRoutes.dashboard}
            className="flex items-center gap-2 rounded-full font-display text-lg font-bold tracking-tight text-ink outline-none transition-opacity duration-150 ease-out hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandMark className="h-5 w-5" />
            ProductMap
          </Link>
          <div className="hidden md:block">
            <ProjectSwitcher />
          </div>
          <div className="hidden items-center gap-1.5 md:flex">
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
            {activeSlug ? (
              <NavLink
                to={appRoutes.projectOverview(activeSlug)}
                className={({ isActive }) => pillClass(isActive)}
              >
                Overview
              </NavLink>
            ) : null}
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
          <div className="ml-auto flex items-center gap-1 md:gap-2">
            <Slot id="nav.analytics" />
            <NotificationBell />
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
