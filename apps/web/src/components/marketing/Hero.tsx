import { Button } from '@productmap/ui';
import { HERO_HEADLINE, HERO_SUBHEAD, REPO_URL } from '@/lib/marketing';
import { HeroGraphic } from '@/components/marketing/motion/HeroGraphic';

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
        </div>
      </div>
      {/* right column */}
      <div className="relative mx-auto w-full max-w-md md:max-w-none">
        <HeroGraphic className="h-auto w-full" />
      </div>
    </section>
  );
}
