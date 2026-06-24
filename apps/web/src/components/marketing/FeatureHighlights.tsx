import { RoadmapIcon, DocsIcon, ReleasesIcon, CopilotIcon } from '@/components/marketing/motion/icons/FeatureIcons';
import { Reveal } from '@/components/marketing/motion/Reveal';

const CARDS = [
  { Icon: RoadmapIcon, title: 'Roadmap & horizons', body: 'Now-next-later board and a Gantt roadmap that keep dates, sizes, and priorities honest.' },
  { Icon: DocsIcon, title: 'Feature hub + docs', body: 'Every feature carries its PRDs, briefs, and tech specs in a markdown editor that is yours.' },
  { Icon: ReleasesIcon, title: 'Releases', body: 'Group features into releases, track status, and ship release notes without leaving the workspace.' },
  { Icon: CopilotIcon, title: 'AI copilot', body: 'Draft docs, summarize activity, and triage the idea inbox with an AI copilot you can point at your own model.' },
] as const;

export default function FeatureHighlights() {
  return (
    <section className="mx-auto max-w-screen-xl px-6 py-16">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map(({ Icon, title, body }, i) => (
          <Reveal key={title} delay={0.08 * i}>
            <div className="group h-full rounded-xl border border-border bg-card p-6 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-md">
              <Icon className="h-6 w-6 text-action transition-transform duration-300 group-hover:scale-110" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
