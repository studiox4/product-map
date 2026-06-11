import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { format } from 'date-fns';
import {
  DOC_TYPE_COLORS,
  DOC_TYPE_LABELS,
  type DocumentListItem,
} from '@productmap/shared';
import { StatusBadge } from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
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

/** Docs listing table: Title / Type / Status / Feature / Updated, sortable on title + updated. */
export function DocsTable({ docs, sort, onSortChange, onRowClick }: DocsTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-transparent bg-surface shadow-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            <SortableHeader label="Title" sortKey="title" sort={sort} onSortChange={onSortChange} />
            <th scope="col" className={headerCellClass}>Type</th>
            <th scope="col" className={headerCellClass}>Status</th>
            <th scope="col" className={headerCellClass}>Feature</th>
            <SortableHeader label="Updated" sortKey="updatedAt" sort={sort} onSortChange={onSortChange} />
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => (
            <tr
              key={doc.id}
              onClick={() => onRowClick(doc.id)}
              className="cursor-pointer border-b border-line transition-colors duration-150 ease-out last:border-b-0 hover:bg-panel"
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
                <Link
                  to={`/features/${doc.featureId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-full text-body-ink underline-offset-2 outline-none transition-colors duration-150 ease-out hover:text-action hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {doc.featureTitle}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-ink">
                {format(new Date(doc.updatedAt), 'MMM d, yyyy')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DocsTable;
