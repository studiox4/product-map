import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from '@/components/AppShell';
import Landing from '@/routes/Landing';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy routes owned by parallel tasks (3B-D); stubs render "coming soon" until they land.
const BoardPage = lazy(() => import('@/routes/Board'));
const RoadmapPage = lazy(() => import('@/routes/Roadmap'));
const DocPage = lazy(() => import('@/routes/Doc'));
const DocsPage = lazy(() => import('@/routes/DocsPage'));
const FeaturePage = lazy(() => import('@/routes/FeaturePage'));
const ReaderView = lazy(() => import('@/components/editor/ReaderView'));

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
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Landing />} />
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
          </Route>
          {/* Chrome-free reader view (spec 2.3) — outside AppShell on purpose. */}
          <Route
            path="/docs/:id/read"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ReaderView />
              </Suspense>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
