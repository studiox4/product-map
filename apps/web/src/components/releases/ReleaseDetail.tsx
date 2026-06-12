import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, CalendarDays, Copy, Rocket, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { Feature } from '@productmap/shared';
import {
  fetchReleaseNotesMd,
  useRelease,
  useShipRelease,
  useUpdateRelease,
} from '@/lib/api';
import { confettiBurst } from '@/lib/delight';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import HorizonBadge from '@/components/HorizonBadge';
import StatusBadge from '@/components/StatusBadge';
import { ReleaseStatusPill } from './ReleaseCard';

function FeaturesTable({ features }: { features: Feature[] }) {
  if (features.length === 0) {
    return (
      <p className="rounded-2xl border border-transparent bg-surface p-6 text-sm text-muted-ink shadow-card">
        No features in this release yet — assign them from a feature's rail.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-transparent bg-surface shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-medium text-muted-ink">
            <th className="px-4 py-2.5 font-medium">Feature</th>
            <th className="px-4 py-2.5 font-medium">Horizon</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Size</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {features.map((feature) => (
            <tr key={feature.id} className="transition-colors duration-150 hover:bg-wash/60">
              <td className="px-4 py-3">
                <Link
                  to={`/features/${feature.id}`}
                  className="font-medium text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {feature.title}
                </Link>
              </td>
              <td className="px-4 py-3">
                <HorizonBadge horizon={feature.horizon} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={feature.status} />
              </td>
              <td className="px-4 py-3">
                {feature.size ? (
                  <span className="inline-flex items-center rounded-full bg-wash px-2 py-0.5 text-xs font-medium uppercase text-body-ink">
                    {feature.size}
                  </span>
                ) : (
                  <span className="text-xs text-muted-ink">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** /releases/:id — features table, notes editor (prefilled from notes.md), copy markdown. */
export default function ReleaseDetail() {
  const { id = '' } = useParams();
  const releaseQuery = useRelease(id);
  const updateRelease = useUpdateRelease();
  const shipRelease = useShipRelease();

  const [notes, setNotes] = useState('');
  const [notesReady, setNotesReady] = useState(false);
  const prefetchedFor = useRef<string | null>(null);

  const release = releaseQuery.data;

  // Seed the editor once per release: saved notes win; otherwise prefill from
  // the auto-assembled notes.md endpoint (unsaved until the user hits Save).
  useEffect(() => {
    if (!release || prefetchedFor.current === release.id) return;
    prefetchedFor.current = release.id;
    if (release.notesMd.trim()) {
      setNotes(release.notesMd);
      setNotesReady(true);
      return;
    }
    let cancelled = false;
    fetchReleaseNotesMd(release.id)
      .then((md) => {
        if (!cancelled) setNotes(md);
      })
      .catch(() => {
        // prefill is best-effort; editor stays empty
      })
      .finally(() => {
        if (!cancelled) setNotesReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [release]);

  if (releaseQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!release) {
    return (
      <div className="rounded-2xl border border-transparent bg-surface p-10 text-center shadow-card">
        <p className="text-sm text-body-ink">Release not found.</p>
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link to="/releases">Back to releases</Link>
        </Button>
      </div>
    );
  }

  const ship = () => {
    if (shipRelease.isPending) return;
    shipRelease.mutate(release.id, {
      onSuccess: () => {
        confettiBurst();
        toast.success(`Shipped ${release.name} 🎉`);
      },
      onError: () => toast.error(`Couldn't ship '${release.name}'`),
    });
  };

  const saveNotes = () => {
    updateRelease.mutate(
      { id: release.id, notesMd: notes },
      {
        onSuccess: () => toast.success('Notes saved'),
        onError: () => toast.error("Couldn't save notes"),
      },
    );
  };

  const regenerate = async () => {
    try {
      setNotes(await fetchReleaseNotesMd(release.id));
      toast.success('Notes regenerated from features');
    } catch {
      toast.error("Couldn't assemble notes");
    }
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(notes);
      toast.success('Markdown copied');
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/releases"
          className="inline-flex items-center gap-1 text-sm text-muted-ink outline-none transition-colors duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Releases
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            {release.name}
          </h1>
          <ReleaseStatusPill status={release.status} />
          {release.targetDate ? (
            <span className="inline-flex items-center gap-1 text-sm text-muted-ink">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {format(new Date(`${release.targetDate}T00:00:00`), 'MMM d, yyyy')}
            </span>
          ) : null}
          {release.status === 'planned' ? (
            <Button
              size="sm"
              className="ml-auto rounded-full"
              onClick={ship}
              disabled={shipRelease.isPending}
            >
              <Rocket className="h-3.5 w-3.5" aria-hidden />
              Ship
            </Button>
          ) : null}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-base font-semibold text-ink">Features</h2>
        <FeaturesTable features={release.features} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-base font-semibold text-ink">Release notes</h2>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={regenerate}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Regenerate
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={copyMarkdown}>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy markdown
            </Button>
            <Button
              size="sm"
              className="rounded-full"
              onClick={saveNotes}
              disabled={updateRelease.isPending || !notesReady}
            >
              Save notes
            </Button>
          </div>
        </div>
        <Textarea
          aria-label="Release notes markdown"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={notesReady ? 'Write release notes in markdown…' : 'Assembling notes…'}
          className="min-h-[280px] rounded-2xl bg-surface font-mono text-sm shadow-card"
        />
      </section>
    </div>
  );
}
