import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { format } from 'date-fns';
import {
  DOC_TYPE_COLORS,
  DOC_TYPE_LABELS,
  type DocOwnerLabel,
  type DocumentFull,
  type DocumentListItem,
} from '@productmap/shared';
import { StatusBadge } from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import { apiPath, fetchJson, queryKeys } from '@/lib/api';
import { useProjectId } from '@/lib/project';
import { hasOpenOverlay, isEditableTarget } from '@/components/command/useGlobalShortcuts';
import { makeHoverPrefetch } from '@/lib/delight';
import { morphStyle } from '@/lib/transitions';

export type DocsSortKey = 'title' | 'updatedAt';

export interface DocsSort {
  key: DocsSortKey;
  dir: 'asc' | 'desc';
}

interface DocsTableProps {
  docs: DocumentListItem[];
  sort: DocsSort;
  onSortChange: (key: DocsSortKey) => void;
  onRowClick: (id: string) => void;
}

const headerCellClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-ink';

function SortableHeader({
  label,
  sortKey,
  sort,
  onSortChange,
}: {
  label: string;
  sortKey: DocsSortKey;
  sort: DocsSort;
  onSortChange: (key: DocsSortKey) => void;
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={headerCellClass} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        onClick={() => onSortChange(sortKey)}
        className="inline-flex items-center gap-1 rounded-full uppercase tracking-wide outline-none transition-colors duration-150 ease-out hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        {active && <Arrow className="h-3 w-3" aria-hidden />}
      </button>
    </th>
  );
}

/** Route for a doc's owning surface chip (dream tier 2 — docs can belong to features, ideas, or releases). */
function ownerHref(owner: DocOwnerLabel): string {
  if (owner.kind === 'idea') return `/inbox?idea=${owner.id}`;
  if (owner.kind === 'release') return `/releases/${owner.id}`;
  return `/features/${owner.id}`;
}

/**
 * Owner cell: idea/release/feature name + link via ownerLabel; falls back to
 * the legacy featureTitle columns, and "—" for ownerless docs.
 */
function OwnerCell({ doc }: { doc: DocumentListItem }) {
  const owner: DocOwnerLabel | null =
    doc.ownerLabel ??
    (doc.featureId
      ? { kind: 'feature', id: doc.featureId, title: doc.featureTitle }
      : null);
  if (!owner) return <span className="text-muted-ink">—</span>;
  return (
    <Link
      to={ownerHref(owner)}
      onClick={(e) => e.stopPropagation()}
      className="rounded-full text-body-ink underline-offset-2 outline-none transition-colors duration-150 ease-out hover:text-action hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {owner.title}
    </Link>
  );
}

function DocsRow({
  doc,
  staggerIndex,
  active,
  onRowClick,
}: {
  doc: DocumentListItem;
  /** null = no entrance animation (rows added after first mount). */
  staggerIndex: number | null;
  /** True when j/k keyboard selection rests on this row. */
  active: boolean;
  onRowClick: (id: string) => void;
}) {

  const pid = useProjectId();
  const queryClient = useQueryClient();
  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  // Hover-prefetch the doc so opening the editor feels instant.
  const hoverPrefetch = useMemo(
    () =>
      makeHoverPrefetch(() => {
        void queryClient.prefetchQuery({
          queryKey: queryKeys.document(pid, doc.id),
          queryFn: () => fetchJson<DocumentFull>(apiPath(pid, 'documents', doc.id)),
        });
      }),
    [queryClient, pid, doc.id],
  );

  return (
    <tr
      ref={rowRef}
      data-active={active || undefined}
      onClick={() => onRowClick(doc.id)}
      onMouseEnter={hoverPrefetch.onMouseEnter}
      onMouseLeave={hoverPrefetch.onMouseLeave}
      className={cn(
        'cursor-pointer border-b border-line transition-colors duration-150 ease-out last:border-b-0 hover:bg-panel',
        active && 'bg-panel',
        staggerIndex !== null && 'fade-up',
      )}
      style={staggerIndex !== null ? { animationDelay: `${staggerIndex * 40}ms` } : undefined}
    >
      <td className="px-4 py-3 font-medium text-ink">
        <span className="inline-block" style={morphStyle('doc-title', doc.id)}>
          {doc.title}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
            DOC_TYPE_COLORS[doc.type].chip,
          )}
        >
          {DOC_TYPE_LABELS[doc.type]}
        </span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={doc.status} />
      </td>
      <td className="px-4 py-3">
        <OwnerCell doc={doc} />
      </td>
      <td className="px-4 py-3 text-muted-ink">
        {format(new Date(doc.updatedAt), 'MMM d, yyyy')}
      </td>
    </tr>
  );
}

/** Docs listing table: Title / Type / Status / Feature / Updated, sortable on title + updated. */
export function DocsTable({ docs, sort, onSortChange, onRowClick }: DocsTableProps) {
  // Staggered fade-up runs on first mount only — rows that appear later
  // (filtering, refetch) render without an entrance animation.
  const firstMount = useRef(true);
  useEffect(() => {
    firstMount.current = false;
  }, []);

  // j/k keyboard selection (Enter opens) — quiet while typing or a dialog is open.
  const [activeIndex, setActiveIndex] = useState(-1);
  const stateRef = useRef({ docs, activeIndex, onRowClick });
  stateRef.current = { docs, activeIndex, onRowClick };

  useEffect(() => {
    setActiveIndex((i) => (i >= docs.length ? docs.length - 1 : i));
  }, [docs.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target) || hasOpenOverlay()) return;
      const { docs: rows, activeIndex: active, onRowClick: open } = stateRef.current;
      if (rows.length === 0) return;
      if (e.key === 'j') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
      } else if (e.key === 'k') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && active >= 0 && active < rows.length) {
        e.preventDefault();
        open(rows[active].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-transparent bg-surface shadow-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            <SortableHeader label="Title" sortKey="title" sort={sort} onSortChange={onSortChange} />
            <th scope="col" className={headerCellClass}>Type</th>
            <th scope="col" className={headerCellClass}>Status</th>
            <th scope="col" className={headerCellClass}>Owner</th>
            <SortableHeader label="Updated" sortKey="updatedAt" sort={sort} onSortChange={onSortChange} />
          </tr>
        </thead>
        <tbody>
          {docs.map((doc, i) => (
            <DocsRow
              key={doc.id}
              doc={doc}
              staggerIndex={firstMount.current ? i : null}
              active={i === activeIndex}
              onRowClick={onRowClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DocsTable;
