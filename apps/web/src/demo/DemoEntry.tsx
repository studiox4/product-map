import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BrandMark } from '@/components/BrandMark';

/**
 * `/demo` boot route. On mount it spins up the in-page demo backend, primes the
 * auth cache with the demo user, then replaces the URL with `/app` so the
 * visitor lands in the real application as the demo user.
 *
 * CODE-SPLIT CONTRACT: this component reaches `enableDemo` / `getDemoUser` only
 * through a DYNAMIC `import('./enableDemo')` inside the effect — never a static
 * top-level import. That keeps the heavy PGlite / Hono graph out of DemoEntry's
 * own chunk (and out of the main + landing chunks), landing it in a lazy chunk
 * loaded only when someone actually visits `/demo`.
 */
export default function DemoEntry() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const started = useRef(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // The ref guard is the single source of run-once truth: it survives
    // StrictMode's mount → unmount → remount, so the boot runs exactly once and
    // the success path (setQueryData + navigate) always fires. We deliberately
    // DON'T gate that path on a per-effect "cancelled" flag — under StrictMode
    // the first effect's cleanup would flip it before the async boot resolves,
    // stranding the redirect on a forever-spinning loader. `mounted` only
    // suppresses the error state after a genuine unmount.
    if (started.current) return;
    started.current = true;

    let mounted = true;
    (async () => {
      try {
        const { enableDemo, getDemoUser } = await import('./enableDemo');
        await enableDemo();
        queryClient.setQueryData(['me'], getDemoUser());
        navigate('/app', { replace: true });
      } catch (err) {
        console.error('[demo] failed to boot', err);
        if (mounted) setError(true);
      }
    })();

    return () => {
      mounted = false;
    };
    // `attempt` is in deps so "Try again" re-runs the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground">
      <BrandMark className="h-10 w-10 text-action" />
      {error ? (
        <div className="flex flex-col items-center gap-4">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-ink">
              Couldn&rsquo;t start the demo
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Something went wrong spinning up the in-browser workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              started.current = false;
              setError(false);
              setAttempt((n) => n + 1);
            }}
            className="rounded-full bg-action px-5 py-2 text-sm font-medium text-white outline-none transition-colors hover:bg-action/90 focus-visible:ring-2 focus-visible:ring-ring"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">
            Spinning up your demo&hellip;
          </h1>
          <p className="text-sm text-muted-foreground">
            Building a private workspace in your browser. No sign-up, nothing saved.
          </p>
          <div
            aria-hidden
            className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-surface"
          >
            <div className="h-full w-1/2 animate-pulse rounded-full bg-action" />
          </div>
        </div>
      )}
    </div>
  );
}
