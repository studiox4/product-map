import { Button } from '@/components/ui/button';
import { HERO_HEADLINE, HERO_SUBHEAD, REPO_URL } from '@/lib/marketing';

export default function Hero() {
  return (
    <section className="mx-auto grid max-w-screen-xl items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
          {HERO_HEADLINE}
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">{HERO_SUBHEAD}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <a href="/demo">Try the live demo</a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
              Deploy your own
            </a>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <a href="/login">Sign in</a>
          </Button>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-2 shadow-lg">
        <img
          src="/marketing/hero.png"
          alt="ProductMap roadmap board"
          className="w-full rounded-lg"
          loading="eager"
        />
      </div>
    </section>
  );
}
