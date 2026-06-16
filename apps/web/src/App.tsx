import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from '@/components/AppShell';
import Landing from '@/routes/Landing';
import Login from '@/routes/Login';
import Register from '@/routes/Register';
import { AuthProvider, RequireAuth } from '@/lib/auth';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy routes owned by parallel tasks (3B-D); stubs render "coming soon" until they land.
const BoardPage = lazy(() => import('@/routes/Board'));
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
const TemplateEditorPage = lazy(() => import('@/routes/TemplateEditor'));
const SharePage = lazy(() => import('@/routes/SharePage'));
// Releases + Outcomes (Dream tier D7/D9 — releases+outcomes agent route lines).
const ReleasesPage = lazy(() => import('@/routes/Releases'));
const ReleaseDetailPage = lazy(() => import('@/components/releases/ReleaseDetail'));
const OutcomesPage = lazy(() => import('@/routes/Outcomes'));

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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes — no auth required. */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<RequireAuth><AppShell /></RequireAuth>}>
              <Route path="/" element={<Landing />} />
            {/* Idea Inbox (inbox agent route line). */}
            <Route
              path="/inbox"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <InboxPage />
                </Suspense>
              }
            />
            <Route
              path="/board"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <BoardPage />
                </Suspense>
              }
            />
            <Route
              path="/roadmap"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <RoadmapPage />
                </Suspense>
              }
            />
            <Route
              path="/features/:id"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <FeaturePage />
                </Suspense>
              }
            />
            {/* Releases + Outcomes (releases+outcomes agent route lines). */}
            <Route
              path="/releases"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <ReleasesPage />
                </Suspense>
              }
            />
            <Route
              path="/releases/:id"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <ReleaseDetailPage />
                </Suspense>
              }
            />
            <Route
              path="/outcomes"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <OutcomesPage />
                </Suspense>
              }
            />
            <Route
              path="/docs"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <DocsPage />
                </Suspense>
              }
            />
            <Route
              path="/docs/:id"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <DocPage />
                </Suspense>
              }
            />
            <Route
              path="/settings"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <SettingsPage />
                </Suspense>
              }
            >
              {/* Settings shell: tab content renders via <Outlet/> (own Suspense). */}
              <Route index element={<Navigate to="/settings/templates" replace />} />
              <Route path="templates" element={<TemplatesTab />} />
              <Route path="workspace" element={<WorkspaceTab />} />
              <Route path="profile" element={<ProfileTab />} />
              <Route path="users" element={<UsersTab />} />
              {/* Unknown tabs fall back to Templates. */}
              <Route path="*" element={<Navigate to="/settings/templates" replace />} />
            </Route>
            {/* Template editor: full-page Tiptap chrome, outside the settings card shell. */}
            <Route
              path="/settings/templates/:id"
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
          {/* Chrome-free reader view (spec 2.3) — outside AppShell on purpose, but auth-gated. */}
          <Route
            path="/docs/:id/read"
            element={
              <RequireAuth>
                <Suspense fallback={<RouteFallback />}>
                  <ReaderView />
                </Suspense>
              </RequireAuth>
            }
          />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
