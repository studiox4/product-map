import { Plus, Search } from 'lucide-react';
import {
  DOC_STATUSES,
  DOC_STATUS_COLORS,
  DOC_TYPES,
  DOC_TYPE_COLORS,
  DOC_TYPE_LABELS,
  type DocStatus,
  type DocType,
} from '@productmap/shared';
import { Button } from '@productmap/ui';
import { Input } from '@productmap/ui';
import { STATUS_LABELS } from '@/components/StatusBadge';
import { cn } from '@productmap/ui/lib/utils';

interface DocsFiltersProps {
  typeFilters: DocType[];
  statusFilters: DocStatus[];
  search: string;
  onToggleType: (type: DocType) => void;
  onToggleStatus: (status: DocStatus) => void;
  onSearchChange: (value: string) => void;
  onNewDoc: () => void;
  /** When false (viewer access), the "New doc" affordance is hidden. */
  canEdit?: boolean;
}

const pillBase =
  'rounded-full px-3 py-1 text-xs font-medium outline-none transition-all duration-150 ease-out ' +
  'focus-visible:ring-2 focus-visible:ring-ring';
const pillInactive = 'bg-surface/60 text-body-ink hover:bg-surface hover:text-ink';

/** Toolbar for the docs page: type + status filter pills (multi-toggle), search, and "+ New doc". */
export function DocsFilters({
  typeFilters,
  statusFilters,
  search,
  onToggleType,
  onToggleStatus,
  onSearchChange,
  onNewDoc,
  canEdit = true,
}: DocsFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5" role="group" aria-label="Filter by type">
        {DOC_TYPES.map((type) => {
          const active = typeFilters.includes(type);
          return (
            <button
              key={type}
              type="button"
              aria-pressed={active}
              onClick={() => onToggleType(type)}
              className={cn(
                pillBase,
                active
                  ? cn(DOC_TYPE_COLORS[type].chip, 'shadow-card')
                  : pillInactive,
              )}
            >
              {DOC_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>
      <span aria-hidden className="h-5 w-px bg-line-strong" />
      <div className="flex items-center gap-1.5" role="group" aria-label="Filter by status">
        {DOC_STATUSES.map((status) => {
          const active = statusFilters.includes(status);
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => onToggleStatus(status)}
              className={cn(
                pillBase,
                active ? cn(DOC_STATUS_COLORS[status], 'shadow-card') : pillInactive,
              )}
            >
              {STATUS_LABELS[status]}
            </button>
          );
        })}
      </div>
      <div className="relative ml-auto w-full max-w-[240px]">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink"
        />
        <Input
          type="search"
          placeholder="Search docs…"
          aria-label="Search docs"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="rounded-full bg-surface pl-9"
        />
      </div>
      {canEdit ? (
        <Button onClick={onNewDoc} className="rounded-full">
          <Plus className="h-4 w-4" aria-hidden />
          New doc
        </Button>
      ) : null}
    </div>
  );
}

export default DocsFilters;
