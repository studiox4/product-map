import { Boxes, CalendarRange, Check, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BoardToRoadmap } from '@/components/marketing/motion/story/BoardToRoadmap';

const ROWS = [
  {
    src: '/marketing/board.png',
    alt: 'Now-next-later board',
    icon: Boxes,
    eyebrow: 'Prioritize',
    title: 'A board everyone can read',
    body: 'Drag features across Now, Next, and Later — each one sized, scored, and voted — so the plan is obvious without a meeting.',
    points: ['Now / Next / Later horizons', 'T-shirt sizing + score', 'Up / down voting'],
    accent: 'board' as const,
  },
  {
    src: '/marketing/roadmap.png',
    alt: 'Gantt roadmap',
    icon: CalendarRange,
    eyebrow: 'Schedule',
    title: 'The timeline, drag-and-drop',
    body: 'Schedule by dragging bars, resize to estimate, and sketch what-if scenarios in isolation before anything ships.',
    points: ['Drag to schedule + resize', 'Scenario drafts', 'Color-coded horizons'],
  },
  {
    src: '/marketing/feature.png',
    alt: 'Feature hub with docs',
    icon: FileText,
    eyebrow: 'Document',
    title: 'Specs that live with the work',
    body: 'PRDs, tech specs, and briefs sit next to every feature in a markdown editor — versioned, exportable, and yours.',
    points: ['PRDs, specs & briefs', 'Markdown that stays yours', 'Versioned + exportable'],
  },
  {
    src: '/marketing/hero.png',
    alt: 'ProductMap overview dashboard',
    icon: Boxes,
    eyebrow: 'Overview',
    title: 'Everything, at a glance',
    body: 'The dashboard pulls your board, roadmap, and docs into one overview — the same product you saw up top, real and self-hosted.',
    points: ['Unified overview', 'Self-hosted', 'Your data'],
  },
];

export default function ScreenshotStrip() {
  return (
    <section className="mx-auto max-w-screen-xl px-6 py-16 md:py-24">
      <div className="mx-auto mb-14 max-w-2xl text-center md:mb-20">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-action">
          One workspace
        </p>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
          The whole loop, in one place
        </h2>
      </div>

      <div className="flex flex-col gap-16 md:gap-28">
        {ROWS.map(({ src, alt, icon: Icon, eyebrow, title, body, points, accent }, i) => {
          const imageRight = i % 2 === 1;
          return (
            <div key={src} className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
              {/* Copy */}
              <div className={cn('flex flex-col gap-5', imageRight ? 'md:order-1' : 'md:order-2')}>
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-action-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-action">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {eyebrow}
                </span>
                <h3 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
                  {title}
                </h3>
                <p className="text-lg text-muted-foreground">{body}</p>
                <ul className="flex flex-col gap-2.5">
                  {points.map((point) => (
                    <li key={point} className="flex items-center gap-2.5 text-sm text-body-ink">
                      <Check className="h-4 w-4 shrink-0 text-action" aria-hidden />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Image */}
              <figure
                className={cn(
                  'overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-lg',
                  imageRight ? 'md:order-2' : 'md:order-1',
                )}
              >
                {accent === 'board' && (
                  <BoardToRoadmap className="mb-2 h-16 w-full text-ink/70" />
                )}
                <img src={src} alt={alt} className="w-full rounded-xl" loading="lazy" />
              </figure>
            </div>
          );
        })}
      </div>
    </section>
  );
}
