import { useEffect, useState } from 'react';
import { Github, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GITHUB_API_URL, REPO_URL, STARS_FALLBACK } from '@/lib/marketing';
import { CountUp } from '@/components/marketing/motion/CountUp';

/**
 * Mount-gated star badge. `mounted` starts false so the FIRST render (the one
 * the SSR/prerender step captures) returns null — this is how GitHubStars is
 * EXCLUDED from prerendered HTML. After mount we fetch GitHub's public API and
 * fall back to STARS_FALLBACK on any failure (offline / rate-limited / air-gapped).
 */
export default function GitHubStars() {
  const [mounted, setMounted] = useState(false);
  const [stars, setStars] = useState<number>(STARS_FALLBACK);

  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    fetch(GITHUB_API_URL)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('bad status'))))
      .then((data: { stargazers_count?: number }) => {
        if (!cancelled && typeof data.stargazers_count === 'number') {
          setStars(data.stargazers_count);
        }
      })
      .catch(() => {
        /* keep STARS_FALLBACK */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mounted) return null;

  return (
    <section className="mx-auto max-w-screen-xl px-6 py-12 text-center">
      <Button asChild variant="outline" size="lg">
        <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
          <Github className="h-4 w-4" aria-hidden />
          <span>Star on GitHub</span>
          <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
            <Star className="h-4 w-4" aria-hidden />
            <CountUp value={stars} />
          </span>
        </a>
      </Button>
    </section>
  );
}
