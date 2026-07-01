import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Map as MapIcon } from 'lucide-react';
import {
  HORIZONS,
  HORIZON_COLORS,
  type Feature,
  type FeatureWithDocs,
  type Horizon,
  type Release,
} from '@productmap/shared';
import { useShareData } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@productmap/ui';
import {
  BAR_HEIGHT,
  GUTTER_WIDTH,
  HEADER_HEIGHT,
  PX_PER_DAY,
  ROW_HEIGHT,
  barRect,
  computeViewRange,
  dateToX,
  monthTicks,
} from '@/components/gantt/gantt-math';

const HORIZON_LABELS: Record<Horizon, string> = {
  now: 'Now',
  next: 'Next',
  later: 'Later',
};

/**
 * Public share page (dream tier D8): chrome-less, read-only roadmap at
 * /share/:token. No AppShell, no auth, zero mutating affordances — a
 * read-only gantt, the now/next/later summary, and a shipped changelog.
 * Theme follows the OS preference (fresh contexts have no stored theme).
 */
export default function SharePage() {
  const { token = '' } = useParams<{ token: string }>();
  const query = useShareData(token);

  // System theme: the viewer has no app chrome (and likely no localStorage
  // state), so track prefers-color-scheme directly for the page lifetime.
  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.classList.toggle('dark', !!mql?.matches);
    apply();
    mql?.addEventListener?.('change', apply);
    return () => mql?.removeEventListener?.('change', apply);
  }, []);

  // Public share pages must never be indexed. No SSR here, so inject the robots
  // meta at runtime and remove it on unmount so it can't leak to other SPA
  // routes. robots.txt is the belt-and-suspenders for JS-less crawlers.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  if (query.isLoading) {
    return (
      <ShareFrame>
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-6 h-64 w-full rounded-2xl" />
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </ShareFrame>
    );
  }

  if (query.isError || !query.data) {
    return (
      <ShareFrame>
        <div className="mx-auto mt-24 max-w-md rounded-2xl bg-card p-10 text-center shadow-card">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">
            This link isn't active
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The share link expired, was revoked, or never existed. Ask the
            workspace owner for a fresh one.
          </p>
        </div>
      </ShareFrame>
    );
  }

  const { project, features, releases, sections } = query.data;
  const shipped = releases.filter((r) => r.status === 'shipped');

  return (
    <ShareFrame>
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
          {project.name}
        </h1>
        {project.vision && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{project.vision}</p>
        )}
      </header>

      {sections.roadmap && (
        <section aria-label="Roadmap timeline" className="mt-8">
          <ShareGantt features={features} />
        </section>
      )}

      {sections.board && (
        <section aria-label="Now, next, later" className="mt-10">
          <div className="grid gap-6 md:grid-cols-3">
            {HORIZONS.map((horizon) => (
              <HorizonColumn
                key={horizon}
                horizon={horizon}
                features={features.filter((f) => f.horizon === horizon)}
              />
            ))}
          </div>
        </section>
      )}

      {sections.changelog && shipped.length > 0 && (
        <section aria-label="Changelog" className="mt-10">
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">
            Changelog
          </h2>
          <div className="mt-4 space-y-4">
            {shipped.map((release) => (
              <ChangelogEntry key={release.id} release={release} features={features} />
            ))}
          </div>
        </section>
      )}
    </ShareFrame>
  );
}

/** Minimal page shell: centered column + ProductMap badge footer. */
function ShareFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <main className="mx-auto w-full max-w-5xl px-6 py-10">{children}</main>
      <footer className="mx-auto flex w-full max-w-5xl justify-center px-6 pb-10">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-card transition-colors duration-150 ease-out hover:text-ink"
        >
          <MapIcon className="h-3.5 w-3.5 text-action" aria-hidden />
          Made with ProductMap
        </Link>
      </footer>
    </div>
  );
}

function HorizonColumn({ horizon, features }: { horizon: Horizon; features: FeatureWithDocs[] }) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <h2
        className={`border-b-2 pb-2 font-display text-sm font-bold uppercase tracking-wide text-ink ${HORIZON_COLORS[horizon].header}`}
      >
        {HORIZON_LABELS[horizon]}
      </h2>
      {features.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {features.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3">
              <span className="truncate text-sm text-body-ink">{f.title}</span>
              <StatusBadge status={f.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChangelogEntry({ release, features }: { release: Release; features: FeatureWithDocs[] }) {
  const included = features.filter((f) => f.releaseId === release.id);
  return (
    <article className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-bold tracking-tight text-ink">
          {release.name}
        </h3>
        {release.shippedAt && (
          <time
            dateTime={release.shippedAt}
            className="text-xs font-medium text-sage"
          >
            Shipped {format(parseISO(release.shippedAt), 'MMM d, yyyy')}
          </time>
        )}
      </div>
      {included.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {included.map((f) => (
            <li key={f.id} className="text-sm text-body-ink">
              {f.title}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/**
 * Read-only gantt: a simplified copy of GanttChart's geometry (same
 * gantt-math) with all drag/click affordances stripped — pure SVG output.
 */
function ShareGantt({ features }: { features: Feature[] }) {
  const dated = useMemo(
    () =>
      features
        .filter((f) => f.startDate && f.endDate)
        .sort(
          (a, b) =>
            a.startDate!.localeCompare(b.startDate!) || a.title.localeCompare(b.title),
        ),
    [features],
  );

  const { viewStart, totalDays } = useMemo(() => computeViewRange(dated), [dated]);

  if (dated.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-10 text-center shadow-card">
        <p className="text-sm text-muted-foreground">No scheduled features yet.</p>
      </div>
    );
  }

  const plotWidth = totalDays * PX_PER_DAY;
  const chartHeight = HEADER_HEIGHT + dated.length * ROW_HEIGHT;
  const todayX = dateToX(format(new Date(), 'yyyy-MM-dd'), viewStart, PX_PER_DAY);
  const ticks = monthTicks(viewStart, totalDays, PX_PER_DAY);

  return (
    <div className="overflow-x-auto rounded-2xl bg-card shadow-card">
      <svg
        data-share-gantt
        width={GUTTER_WIDTH + plotWidth}
        height={chartHeight}
        role="img"
        aria-label="Read-only roadmap gantt chart"
      >
        {/* Month gridlines + labels */}
        {ticks.map((tick) => (
          <g key={tick.label}>
            <line
              x1={GUTTER_WIDTH + tick.x}
              y1={HEADER_HEIGHT}
              x2={GUTTER_WIDTH + tick.x}
              y2={chartHeight}
              stroke="var(--pm-line)"
              strokeWidth={1}
            />
            <text
              x={GUTTER_WIDTH + tick.x + 6}
              y={HEADER_HEIGHT - 14}
              fontSize={11}
              fontWeight={500}
              fill="var(--pm-muted)"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/* Today marker */}
        {todayX >= 0 && todayX <= plotWidth && (
          <line
            x1={GUTTER_WIDTH + todayX}
            y1={HEADER_HEIGHT}
            x2={GUTTER_WIDTH + todayX}
            y2={chartHeight}
            stroke="var(--pm-action)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}

        {/* Rows: gutter label + static bar */}
        {dated.map((f, i) => {
          const rect = barRect(f, viewStart, PX_PER_DAY, i);
          const y = HEADER_HEIGHT + i * ROW_HEIGHT;
          return (
            <g key={f.id}>
              <line
                x1={0}
                y1={y + ROW_HEIGHT}
                x2={GUTTER_WIDTH + plotWidth}
                y2={y + ROW_HEIGHT}
                stroke="var(--pm-line)"
                strokeWidth={1}
              />
              <text
                x={12}
                y={y + ROW_HEIGHT / 2 + 4}
                fontSize={12}
                fontWeight={500}
                fill="var(--pm-ink)"
              >
                {f.title.length > 26 ? `${f.title.slice(0, 25)}…` : f.title}
              </text>
              {rect && (
                <rect
                  data-share-bar={f.id}
                  x={GUTTER_WIDTH + rect.x}
                  y={y + (ROW_HEIGHT - BAR_HEIGHT) / 2}
                  width={rect.width}
                  height={BAR_HEIGHT}
                  rx={BAR_HEIGHT / 2}
                  fill={HORIZON_COLORS[f.horizon].bar}
                >
                  <title>{`${f.title}, ${f.startDate} to ${f.endDate}`}</title>
                </rect>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
