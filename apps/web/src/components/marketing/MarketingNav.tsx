import { Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/BrandMark';
import { REPO_URL } from '@/lib/marketing';

/**
 * Presentational nav. The public site has no login flow — visitors are sent to
 * the no-auth `/demo` (the real app running in-browser). Fully static, so it
 * prerenders cleanly with no runtime fetch.
 */
export default function MarketingNav() {
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
        <Button asChild size="sm">
          <a href="/demo">Try the demo</a>
        </Button>
      </div>
    </nav>
  );
}
