import { useEffect, useState } from 'react';
import { Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/BrandMark';
import { REPO_URL } from '@/lib/marketing';

/**
 * Presentational nav. Auth is checked with a BARE fetch (NOT useMe) because
 * Marketing has no QueryProvider. The check is non-blocking progressive
 * enhancement: we render "Sign in" immediately and upgrade to "Open app" only
 * if a live session is found. The prerendered HTML therefore always ships the
 * "Sign in" baseline.
 */
export default function MarketingNav() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => {
        if (!cancelled && res.ok) setAuthed(true);
      })
      .catch(() => {
        /* offline / no session — keep the Sign in baseline */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav className="mx-auto flex h-16 max-w-screen-xl items-center justify-between px-6">
      <a
        href="/"
        className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink"
      >
        <BrandMark className="h-5 w-5" />
        ProductMap
      </a>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
            <Github className="h-4 w-4" aria-hidden />
            GitHub
          </a>
        </Button>
        {authed ? (
          <Button asChild size="sm">
            <a href="/app">Open app</a>
          </Button>
        ) : (
          <Button asChild size="sm">
            <a href="/login">Sign in</a>
          </Button>
        )}
      </div>
    </nav>
  );
}
