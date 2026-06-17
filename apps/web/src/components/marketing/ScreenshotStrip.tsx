const SHOTS = [
  { src: '/marketing/board.png', alt: 'Now-next-later board' },
  { src: '/marketing/roadmap.png', alt: 'Gantt roadmap' },
  { src: '/marketing/feature.png', alt: 'Feature hub with docs' },
] as const;

export default function ScreenshotStrip() {
  return (
    <section className="mx-auto max-w-screen-xl px-6 py-16">
      <div className="grid gap-6 md:grid-cols-3">
        {SHOTS.map(({ src, alt }) => (
          <figure key={src} className="rounded-xl border border-border bg-card p-2 shadow-md">
            <img src={src} alt={alt} className="w-full rounded-lg" loading="lazy" />
            <figcaption className="px-2 py-2 text-sm text-muted-foreground">{alt}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
