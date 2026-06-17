import { Boxes, FileText, Rocket, Sparkles } from 'lucide-react';

const CARDS = [
  {
    icon: Boxes,
    title: 'Roadmap & horizons',
    body: 'Now-next-later board and a Gantt roadmap that keep dates, sizes, and priorities honest.',
  },
  {
    icon: FileText,
    title: 'Feature hub + docs',
    body: 'Every feature carries its PRDs, briefs, and tech specs in a markdown editor that is yours.',
  },
  {
    icon: Rocket,
    title: 'Releases',
    body: 'Group features into releases, track status, and ship release notes without leaving the workspace.',
  },
  {
    icon: Sparkles,
    title: 'AI copilot',
    body: 'Draft docs, summarize activity, and triage the idea inbox with an AI copilot you can point at your own model.',
  },
] as const;

export default function FeatureHighlights() {
  return (
    <section className="mx-auto max-w-screen-xl px-6 py-16">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <Icon className="h-6 w-6 text-action" aria-hidden />
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
