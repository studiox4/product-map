import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from '@/components/AppShell';
import { NewProjectDialog } from '@/components/NewProjectDialog';
import Dashboard from '@/routes/Dashboard';
import Login from '@/routes/Login';
import Register from '@/routes/Register';
import { AuthProvider, RequireAuth } from '@/lib/auth';
import { ActiveProjectProvider, ProjectProvider, useActiveProject } from '@/lib/project';
import { Skeleton } from '@/components/ui/skeleton';
import { appRoutes } from '@/lib/routes';

// Lazy routes owned by parallel tasks (3B-D); stubs render "coming soon" until they land.
const BoardPage = lazy(() => import('@/routes/Board'));
// Single-project overview (the former home), now slug-addressed at /app/p/:slug.
const ProjectOverviewPage = lazy(() => import('@/routes/ProjectOverview'));
// Idea Inbox (Dream tier D1 — inbox agent route line).
const InboxPage = lazy(() => import('@/routes/Inbox'));
const RoadmapPage = lazy(() => import('@/routes/Roadmap'));
const DocPage = lazy(() => import('@/routes/Doc'));
const DocsPage = lazy(() => import('@/routes/DocsPage'));
const FeaturePage = lazy(() => import('@/routes/FeaturePage'));
const ReaderView = lazy(() => import('@/components/editor/ReaderView'));
const SettingsPage = lazy(() => import('@/routes/Settings'));
const WorkspaceTab = lazy(() => import('@/components/settings/WorkspaceTab'));
const ProfileTab = lazy(() => import('@/components/settings/ProfileTab'));
const TemplatesTab = lazy(() => import('@/components/settings/TemplatesTab'));
const UsersTab = lazy(() => import('@/components/settings/UsersTab'));
const ProjectTab = lazy(() => import('@/components/settings/ProjectTab'));
const TemplateEditorPage = lazy(() => import('@/routes/TemplateEditor'));
const SharePage = lazy(() => import('@/routes/SharePage'));
// Accept-invite page — sibling of /share/:token; does its own auth check + redirect.
const AcceptInvitePage = lazy(() => import('@/routes/AcceptInvite'));
// First-run gate — shown by AuthedShell when the caller has no memberships.
const FirstRunPage = lazy(() => import('@/routes/FirstRun'));
// Releases + Outcomes (Dream tier D7/D9 — releases+outcomes agent route lines).
const ReleasesPage = lazy(() => import('@/routes/Releases'));
const ReleaseDetailPage = lazy(() => import('@/components/releases/ReleaseDetail'));
const OutcomesPage = lazy(() => import('@/routes/Outcomes'));
const Marketing = lazy(() => import('@/routes/Marketing'));
// Demo boot route. Lazy so the heavy PGlite/demo graph it dynamically imports
// never enters the main or landing chunk — it loads only when /demo is visited.
const DemoEntry = lazy(() => import('@/demo/DemoEntry'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5_000 },
  },
});

function RouteFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Authed area shell. Reads the active-project context (provided by the route
 * wrapper) and gates on first-run: while the project list loads, render
 * nothing; with no projects, render the FirstRun create gate; otherwise the
 * full AppShell.
 */
function AuthedShell() {
  const { projects, isLoading } = useActiveProject();
  if (isLoading) return null;
  if (projects.length === 0) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <FirstRunPage />
      </Suspense>
    );
  }
  return (
    <>
      <AppShell />
      {/* "New project…" (switcher) → ?new=1 opens this dialog for callers who
          already have projects; zero-project users get FirstRun above. */}
      <NewProjectDialog />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes — no auth required. */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            {/* Demo boot — public; spins up the in-page demo then redirects to /app. */}
            <Route
              path="/demo"
              element={
                <Suspense fallback={null}>
                  <DemoEntry />
                </Suspense>
              }
            />
            {/* Marketing landing — presentational, no providers; prerendered for `/`. */}
            <Route
              path="/"
              element={
                <Suspense fallback={null}>
                  <Marketing />
                </Suspense>
              }
            />
            {/* Authed application — everything under /app/*. */}
            <Route
              path="/app"
              element={
                <RequireAuth>
                  <ActiveProjectProvider>
                    <AuthedShell />
                  </ActiveProjectProvider>
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              {/* Single-project overview, slug-addressed. */}
              <Route
                path="p/:slug"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ProjectOverviewPage />
                  </Suspense>
                }
              />
              {/* Idea Inbox (inbox agent route line). */}
              <Route
                path="inbox"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <InboxPage />
                  </Suspense>
                }
              />
              <Route
                path="board"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <BoardPage />
                  </Suspense>
                }
              />
              <Route
                path="roadmap"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <RoadmapPage />
                  </Suspense>
                }
              />
              <Route
                path="features/:id"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <FeaturePage />
                  </Suspense>
                }
              />
              {/* Releases + Outcomes (releases+outcomes agent route lines). */}
              <Route
                path="releases"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ReleasesPage />
                  </Suspense>
                }
              />
              <Route
                path="releases/:id"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ReleaseDetailPage />
                  </Suspense>
                }
              />
              <Route
                path="outcomes"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <OutcomesPage />
                  </Suspense>
                }
              />
              <Route
                path="docs"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <DocsPage />
                  </Suspense>
                }
              />
              <Route
                path="docs/:id"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <DocPage />
                  </Suspense>
                }
              />
              <Route
                path="settings"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <SettingsPage />
                  </Suspense>
                }
              >
                {/* Settings shell: tab content renders via <Outlet/> (own Suspense). */}
                <Route index element={<Navigate to="/app/settings/templates" replace />} />
                <Route path="templates" element={<TemplatesTab />} />
                <Route path="workspace" element={<WorkspaceTab />} />
                <Route path="profile" element={<ProfileTab />} />
                <Route path="project" element={<ProjectTab />} />
                <Route path="users" element={<UsersTab />} />
                {/* Unknown tabs fall back to Templates. */}
                <Route path="*" element={<Navigate to="/app/settings/templates" replace />} />
              </Route>
              {/* Template editor: full-page Tiptap chrome, child of /app layout. */}
              <Route
                path="settings/templates/:id"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <TemplateEditorPage />
                  </Suspense>
                }
              />
            </Route>
            {/* Public read-only share page (dream tier D8) — outside AppShell, no auth. */}
            <Route
              path="/share/:token"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <SharePage />
                </Suspense>
              }
            />
            {/* Accept-invite — sibling of /share/:token, outside the active-project
                gate; the page handles its own auth check + login redirect. */}
            <Route
              path="/invite/:token"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <AcceptInvitePage />
                </Suspense>
              }
            />
            {/* Chrome-free reader view (spec 2.3) — separate top-level /app route,
                NOT nested under the AuthedShell layout; auth-gated AND project-scoped. */}
            <Route
              path="/app/docs/:id/read"
              element={
                <RequireAuth>
                  <ProjectProvider>
                    <Suspense fallback={<RouteFallback />}>
                      <ReaderView />
                    </Suspense>
                  </ProjectProvider>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
