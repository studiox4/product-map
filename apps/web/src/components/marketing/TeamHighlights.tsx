import { Reveal } from '@/components/marketing/motion/Reveal';
import { SwitcherMock } from '@/components/marketing/motion/team/SwitcherMock';
import { RolesMock } from '@/components/marketing/motion/team/RolesMock';
import { ShareMock } from '@/components/marketing/motion/team/ShareMock';
import { IntakeMock } from '@/components/marketing/motion/team/IntakeMock';

const CARDS = [
  {
    Illustration: SwitcherMock,
    title: 'Multiple projects, one workspace',
    body: 'Run every roadmap from one place. Switch projects instantly and see what needs you across all of them on a single home.',
  },
  {
    Illustration: RolesMock,
    title: 'Your team, the right access',
    body: 'Invite teammates by email and give each the right access — owner, editor, or viewer.',
  },
  {
    Illustration: ShareMock,
    title: 'Share roadmaps, publicly',
    body: 'Publish a read-only link to your roadmap. Choose which sections show, set an expiry, and keep it out of search.',
  },
  {
    Illustration: IntakeMock,
    title: 'Collect ideas from anyone',
    body: 'Drop a no-login intake form anywhere. Submissions land in your inbox to triage, promote, or dismiss.',
  },
] as const;

export default function TeamHighlights() {
  return (
    <section className="mx-auto max-w-screen-xl px-6 pb-16">
      <Reveal>
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Built for teams</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          From a solo backlog to a team with stakeholders — multiple projects, the right access, and
          a public face when you want one.
        </p>
      </Reveal>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map(({ Illustration, title, body }, i) => (
          <Reveal key={title} delay={0.08 * i}>
            <div className="h-full rounded-xl border border-border bg-card p-6 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-md">
              <Illustration className="mb-4" />
              <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
